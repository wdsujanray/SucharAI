import os
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from openai import OpenAI
from backend.database import get_db
from backend.models import Conversation, Message, Document, User
from backend.schemas import ConversationCreate, ConversationUpdate, ConversationOut, MessageOut, MessageCreate, DocumentOut
from backend.auth import get_current_user
from backend.rag_service import RAGService
from gtts import gTTS

router = APIRouter(prefix="/api", tags=["chat"])

# Initialize OpenAI-compatible API client
# e.g., using Gemini OpenAI Endpoint or custom model endpoint
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", os.getenv("GEMINI_API_KEY", ""))
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1") # Or local provider endpoint

def get_openai_client():
    return OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(conv_in: ConversationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = Conversation(
        user_id=current_user.id,
        title=conv_in.title or "New Conversation",
        is_archived=False
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation

@router.get("/conversations", response_model=List[ConversationOut])
def get_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Conversation).filter(Conversation.user_id == current_user.id).order_at(Conversation.updated_at.desc()).all()

@router.put("/conversations/{conversation_id}", response_model=ConversationOut)
def update_conversation(conversation_id: int, conv_up: ConversationUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if conv_up.title is not None:
        conversation.title = conv_up.title
    if conv_up.is_archived is not None:
        conversation.is_archived = conv_up.is_archived
        
    db.commit()
    db.refresh(conversation)
    return conversation

@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(conversation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Delete RAG index
    rag = RAGService(conversation_id)
    rag.delete_index()
    
    db.delete(conversation)
    db.commit()
    return

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageOut])
def get_messages(conversation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.created_at.asc()).all()

@router.post("/conversations/{conversation_id}/upload", response_model=DocumentOut)
async def upload_document(conversation_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Save file to disk
    upload_dir = f"data/uploads/conv_{conversation_id}"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    file_bytes = await file.read()
    with open(file_path, "wb") as f:
        f.write(file_bytes)
        
    # Chunk, embed, and index document in FAISS
    rag = RAGService(conversation_id)
    content_text = rag.add_document(file.filename, file_bytes)
    
    document = Document(
        conversation_id=conversation_id,
        filename=file.filename,
        file_path=file_path,
        content_text=content_text or ""
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document

@router.get("/conversations/{conversation_id}/documents", response_model=List[DocumentOut])
def get_documents(conversation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return db.query(Document).filter(Document.conversation_id == conversation_id).all()

@router.post("/conversations/{conversation_id}/chat")
async def chat_stream(conversation_id: int, user_message: MessageCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Save user message to database
    u_msg = Message(conversation_id=conversation_id, role="user", content=user_message.content)
    db.add(u_msg)
    
    # Fetch conversation history
    history = db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.created_at.asc()).all()
    
    # RAG: Retrieve context from documents
    rag = RAGService(conversation_id)
    retrieved_context = rag.retrieve_context(user_message.content, k=3)
    
    # Build prompt messages list
    messages = []
    
    # Add system instructions with RAG context
    system_prompt = "You are a professional, helpful AI Chatbot. Adopt a helpful, warm, and structured communication style."
    if retrieved_context:
        system_prompt += f"\n\nUse the following retrieved context from the uploaded documents to answer the user's question. If the information isn't in the context, say so.\n\nContext:\n{retrieved_context}"
        
    messages.append({"role": "system", "content": system_prompt})
    
    for m in history[:-1]:  # Include historical messages (except the current prompt which we append as current role)
        messages.append({"role": m.role, "content": m.content})
        
    messages.append({"role": "user", "content": user_message.content})
    
    # Stream response
    openai_client = get_openai_client()
    
    def event_generator():
        response_stream = openai_client.chat.completions.create(
            model=os.getenv("CHAT_MODEL", "gpt-4-turbo"),
            messages=messages,
            stream=True
        )
        full_reply = ""
        for chunk in response_stream:
            content = chunk.choices[0].delta.content
            if content:
                full_reply += content
                yield f"data: {content}\n\n"
        
        # Once finished, write assistant's full message to database
        # Create a new DB session for writing from streaming thread
        write_db = next(get_db())
        try:
            a_msg = Message(conversation_id=conversation_id, role="assistant", content=full_reply)
            write_db.add(a_msg)
            # Update conversation timestamp
            db_conv = write_db.query(Conversation).filter(Conversation.id == conversation_id).first()
            if db_conv:
                db_conv.updated_at = datetime.datetime.utcnow()
            write_db.commit()
        except Exception as e:
            write_db.rollback()
        finally:
            write_db.close()
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/messages/{message_id}/tts")
def text_to_speech(message_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    os.makedirs("data/tts", exist_ok=True)
    tts_path = f"data/tts/{message_id}.mp3"
    
    if not os.path.exists(tts_path):
        # Generate Text-to-Speech using gTTS
        tts = gTTS(text=message.content, lang="en")
        tts.save(tts_path)
        
        message.has_voice = True
        message.voice_path = tts_path
        db.commit()
        
    def stream_audio():
        with open(tts_path, "rb") as f:
            yield from f
            
    return StreamingResponse(stream_audio(), media_type="audio/mpeg")
