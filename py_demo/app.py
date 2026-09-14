import streamlit as st
import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_chroma import Chroma
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from pathlib import Path
from document_loader import load_supported_documents

DOCS_DIR = Path(__file__).resolve().parent.parent / "demo_docs"

st.set_page_config(page_title="CUNY Secure AI Walled Garden")

st.title("🏛️ CUNY IT Conference 2026")
st.title("     Local AI RAG  Demo")
# 1. Initialize Local Models
ollama_base_url = os.environ.get("OLLAMA_BASE_URL")
llm = ChatOllama(model="llama3.2", base_url=ollama_base_url) if ollama_base_url else ChatOllama(model="llama3.2")
embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url=ollama_base_url) if ollama_base_url else OllamaEmbeddings(model="nomic-embed-text")

@st.cache_resource
def build_vector_store():
    # Load and chunk documents
    docs = load_supported_documents(DOCS_DIR)
    
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    splits = text_splitter.split_documents(docs)
    
    # Build and return the local Chroma database
    return Chroma.from_documents(documents=splits, embedding=embeddings)

try:
    vectorstore = build_vector_store()
except ValueError as error:
    st.error(str(error))
    st.stop()
retriever = vectorstore.as_retriever()

# 2. Configure the RAG Chain
system_prompt = (
    "You are a secure university assistant. Use the following context to answer the question. "
    "If the answer is not in the context, explicitly state that you do not have that information.\n\n"
    "{context}"
)
prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}"),
])

question_answer_chain = create_stuff_documents_chain(llm, prompt)
rag_chain = create_retrieval_chain(retriever, question_answer_chain)

# 3. Render the Chat Interface
query = st.chat_input("Ask a question about university policies...")

if query:
    st.chat_message("user").write(query)
    
    with st.spinner("Querying local vector database..."):
        response = rag_chain.invoke({"input": query})
        
        with st.chat_message("assistant"):
            st.write(response["answer"])
            
            # Prove the walled garden concept by exposing the raw retrieved data
            with st.expander("View Retrieved Source Documents"):
                for doc in response["context"]:
                    source = doc.metadata.get("source", "unknown source")
                    section = doc.metadata.get("section")
                    label = f"{source}"
                    if section:
                        label = f"{label} - {section}"
                    st.caption(label)
                    st.info(doc.page_content)
