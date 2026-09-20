# My Perplexity — Agentic AI Search Assistant

An agentic AI search assistant that routes between web search, document RAG, and a calculator tool to answer questions, with persistent conversation memory and real-time streaming responses.

## Features

- **Agentic tool routing** — powered by LangGraph, the agent decides whether to search the web, query uploaded documents, or use a calculator based on the question
- **RAG over your own documents** — upload PDFs/images, get answers grounded in their content via FAISS + HuggingFace embeddings
- **Persistent conversation memory** — chat history survives server restarts via LangGraph's SqliteSaver
- **Real-time streaming** — responses stream token-by-token over Server-Sent Events
- **Full observability** — every LLM/tool call traced via LangSmith
- **Dockerized** — backend and frontend each run in their own container, orchestrated with docker-compose

## Tech Stack

| Layer               | Technology                     |
| ------------------- | ------------------------------ |
| Agent orchestration | LangGraph, LangChain           |
| LLM                 | Groq (`openai/gpt-oss-20b`)    |
| Web search          | Tavily                         |
| RAG                 | FAISS + HuggingFace embeddings |
| Persistence         | SQLite (LangGraph SqliteSaver) |
| Backend             | Python, FastAPI, SSE           |
| Frontend            | Next.js, React, Tailwind CSS   |
| Observability       | LangSmith                      |
| Deployment          | Docker, docker-compose         |

## Running Locally (with Docker)

1. Clone the repo
2. Create a `.env` file in the root folder with:
GROQ_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_key_here
LANGCHAIN_PROJECT=MyPerplexity
3. Run:
docker-compose up --build
4. Open `http://localhost:3000`

## Architecture Notes / Bugs Fixed

- Fixed a stale retriever closure bug where the RAG tool kept using an outdated FAISS retriever object after document re-uploads — resolved by reading the retriever fresh on every call
- Filtered LangGraph's streamed output to only forward the agent's final response, not raw intermediate tool output
- Wrapped FAISS index loading in a try/except to gracefully bootstrap an empty index on fresh clones
