import os
from typing import List
import io
import PyPDF2
import docx2txt
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

# Initialize embeddings model lazily
_embeddings = None

def get_embeddings_model():
    global _embeddings
    if _embeddings is None:
        # Use a lightweight SentenceTransformers model
        _embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    return _embeddings

def extract_text_from_bytes(file_bytes: bytes, filename: str) -> str:
    _, ext = os.path.splitext(filename.lower())
    if ext == ".txt":
        return file_bytes.decode("utf-8", errors="ignore")
    elif ext == ".pdf":
        text = ""
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text
    elif ext in [".docx", ".doc"]:
        return docx2txt.process(io.BytesIO(file_bytes))
    else:
        raise ValueError(f"Unsupported file type: {ext}")

class RAGService:
    def __init__(self, conversation_id: int):
        self.conversation_id = conversation_id
        self.persist_dir = f"data/faiss_conv_{conversation_id}"
        self.text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

    def add_document(self, filename: str, file_bytes: bytes):
        """Extracts text, splits into chunks, embeds them, and merges into the conversation FAISS index."""
        text = extract_text_from_bytes(file_bytes, filename)
        if not text.strip():
            return
        
        chunks = self.text_splitter.split_text(text)
        metadatas = [{"source": filename, "conversation_id": self.conversation_id} for _ in chunks]
        
        embeddings = get_embeddings_model()
        
        if os.path.exists(self.persist_dir):
            db = FAISS.load_local(self.persist_dir, embeddings, allow_dangerous_deserialization=True)
            db.add_texts(chunks, metadatas=metadatas)
        else:
            db = FAISS.from_texts(chunks, embeddings, metadatas=metadatas)
            
        os.makedirs(os.path.dirname(self.persist_dir), exist_ok=True)
        db.save_local(self.persist_dir)
        return text

    def retrieve_context(self, query: str, k: int = 4) -> str:
        """Retrieves relevant document chunks from the FAISS vector store for this conversation."""
        if not os.path.exists(self.persist_dir):
            return ""
        
        embeddings = get_embeddings_model()
        db = FAISS.load_local(self.persist_dir, embeddings, allow_dangerous_deserialization=True)
        docs = db.similarity_search(query, k=k)
        
        context = []
        for doc in docs:
            context.append(f"[Source: {doc.metadata.get('source')}]\n{doc.page_content}")
            
        return "\n\n---\n\n".join(context)

    def delete_index(self):
        """Clean up FAISS index files if conversation is deleted."""
        import shutil
        if os.path.exists(self.persist_dir):
            shutil.rmtree(self.persist_dir)
Stream = True
