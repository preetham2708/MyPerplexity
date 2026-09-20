
from langgraph.graph import StateGraph, MessagesState, START, END
from langchain_groq import ChatGroq
from langchain_community.tools.tavily_search import TavilySearchResults
from dotenv import load_dotenv
import os
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.tools.retriever import create_retriever_tool
from langchain_core.tools import tool
from langgraph.checkpoint.sqlite import SqliteSaver
import sqlite3
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
import shutil
import json
 
load_dotenv()
 
# --- Embeddings + FAISS retriever (RAG) ---
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
vectorstore = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
retriever = vectorstore.as_retriever(search_kwargs={"k": 6})
 
retriever_tool = create_retriever_tool(
    retriever,
    name="document_search",
    description="Search the user's uploaded documents and images (resume, PDFs, screenshots) for relevant information. Use this for questions about specific files provided, not general web knowledge.",
)
 
# --- Custom calculator tool ---
@tool
def calculator(expression: str) -> str:
    """Evaluate a basic math expression, e.g. '25 * 4 + 10'. Use this for any arithmetic calculation."""
    try:
        result = eval(expression, {"__builtins__": {}})
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {e}"
 
# --- LLM ---
llm = ChatGroq(model="openai/gpt-oss-20b", temperature=0)
 
# --- Tools: web search + document search + calculator ---
search_tool = TavilySearchResults(max_results=3)
tools = [search_tool, retriever_tool, calculator]
llm_with_tools = llm.bind_tools(tools)
 
def agent_node(state: MessagesState):
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": [response]}
 
from langgraph.prebuilt import ToolNode, tools_condition
 
tool_node = ToolNode(tools)
 
graph = StateGraph(MessagesState)
 
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)
 
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", tools_condition)
graph.add_edge("tools", "agent")
 
# --- Persistent checkpointing (SQLite) ---
conn = sqlite3.connect("checkpoints.sqlite", check_same_thread=False)
checkpointer = SqliteSaver(conn)
 
app_graph = graph.compile(checkpointer=checkpointer)
 
# --- FastAPI app ---
api = FastAPI()
 
api.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
 
class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default-thread"
 
TOOL_LABELS = {
    "tavily_search_results_json": "🌐 Searched the web",
    "document_search": "📄 Read your documents",
    "calculator": "🧮 Calculated",
}
 
@api.post("/chat")
async def chat(request: ChatRequest):
    config = {"configurable": {"thread_id": request.thread_id}}
 
    def event_stream():
        used_tools = set()
        sources = set()
 
        for chunk, metadata in app_graph.stream(
            {"messages": [{"role": "user", "content": request.message}]},
            config,
            stream_mode="messages",
        ):
            tool_calls = getattr(chunk, "tool_calls", None)
            if tool_calls:
                for tc in tool_calls:
                    used_tools.add(tc["name"])
 
            if hasattr(chunk, "name") and chunk.name == "document_search":
                sources.add("your uploaded files")
 
            if chunk.content and metadata.get("langgraph_node") == "agent":
                event = {"type": "token", "content": chunk.content}
                yield f"data: {json.dumps(event)}\n\n"
 
        meta_event = {
            "type": "meta",
            "tools_used": [TOOL_LABELS.get(t, t) for t in used_tools],
            "sources": list(sources),
        }
        yield f"data: {json.dumps(meta_event)}\n\n"
 
    return StreamingResponse(event_stream(), media_type="text/event-stream")
 
 
def rebuild_index_from_docs():
    """Reload every PDF in docs/, plus any cached image-OCR text files, rebuild FAISS."""
    all_chunks = []
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
 
    if os.path.isdir("docs") and any(f.lower().endswith(".pdf") for f in os.listdir("docs")):
        loader = PyPDFDirectoryLoader("docs")
        pdf_docs = loader.load()
        all_chunks.extend(splitter.split_documents(pdf_docs))
 
    ocr_path = "docs/_ocr_text.jsonl"
    if os.path.exists(ocr_path):
        with open(ocr_path, "r", encoding="utf-8") as f:
            for line in f:
                record = json.loads(line)
                doc = Document(page_content=record["text"], metadata={"source": record["filename"]})
                all_chunks.extend(splitter.split_documents([doc]))
 
    global vectorstore, retriever
    if all_chunks:
        vectorstore = FAISS.from_documents(all_chunks, embeddings)
        vectorstore.save_local("faiss_index")
        retriever = vectorstore.as_retriever(search_kwargs={"k": 6})
    return len(all_chunks)
 
 
@api.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    os.makedirs("docs", exist_ok=True)
 
    # Clear previous uploads so each new upload batch replaces the knowledge base
    for f in os.listdir("docs"):
        os.remove(os.path.join("docs", f))
 
    results = []
    for file in files:
        filename = file.filename
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        file_path = os.path.join("docs", filename)
 
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
 
        if ext in ("png", "jpg", "jpeg"):
            try:
                import pytesseract
                from PIL import Image
 
                text = pytesseract.image_to_string(Image.open(file_path)).strip()
                if text:
                    ocr_path = "docs/_ocr_text.jsonl"
                    with open(ocr_path, "a", encoding="utf-8") as f:
                        f.write(json.dumps({"filename": filename, "text": text}) + "\n")
                    results.append({"filename": filename, "type": "image", "status": "success"})
                else:
                    results.append({"filename": filename, "type": "image", "status": "no_text"})
            except Exception:
                results.append({"filename": filename, "type": "image", "status": "ocr_unavailable"})
        elif ext == "pdf":
            results.append({"filename": filename, "type": "pdf", "status": "success"})
        else:
            results.append({"filename": filename, "type": ext, "status": "unsupported"})
 
    total_chunks = rebuild_index_from_docs()
    for r in results:
        if r["status"] == "success":
            r["chunks"] = total_chunks
 
    return {"files": results, "total_chunks": total_chunks}
 
 
@api.get("/threads")
async def list_threads():
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT thread_id FROM checkpoints")
    rows = cursor.fetchall()
    return {"threads": [row[0] for row in rows]}
 
 
@api.get("/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    state = app_graph.get_state(config)
    messages = state.values.get("messages", [])
    result = []
    for m in messages:
        if m.type == "human" and m.content:
            result.append({"role": "user", "content": m.content})
        elif m.type == "ai" and m.content:
            result.append({"role": "assistant", "content": m.content, "toolsUsed": [], "sources": []})
    return {"messages": result}
 
 
@api.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
    cursor.execute("DELETE FROM writes WHERE thread_id = ?", (thread_id,))
    conn.commit()
    return {"status": "deleted", "thread_id": thread_id}
 
 
if __name__ == "__main__":
    config = {"configurable": {"thread_id": "test-conversation-1"}}
    user_input2 = "What is my name?"
    result2 = app_graph.invoke({"messages": [{"role": "user", "content": user_input2}]}, config)
    print("Fresh process remembers:", result2["messages"][-1].content)