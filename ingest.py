import os
from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

DOCS_PATH = "docs"
INDEX_PATH = "faiss_index"

def build_index():
    loader = PyPDFDirectoryLoader(DOCS_PATH)
    documents = loader.load()
    print(f"Loaded {len(documents)} pages from PDFs")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
    )
    chunks = splitter.split_documents(documents)
    print(f"Split into {len(chunks)} chunks")

    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    vectorstore = FAISS.from_documents(chunks, embeddings)
    vectorstore.save_local(INDEX_PATH)

    print(f"Saved FAISS index to '{INDEX_PATH}/'")


if __name__ == "__main__":
    build_index()