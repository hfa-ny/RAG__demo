import streamlit as st
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_chroma import Chroma
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
import os

st.set_page_config(page_title="CUNY Secure AI Walled Garden")
st.title("🏛️ Secure Campus AI")

# 1. Initialize Local Models
llm = ChatOllama(model="llama3.2")
embeddings = OllamaEmbeddings(model="nomic-embed-text")

@st.cache_resource
def build_vector_store():
    # Ensure the demo directory exists
    if not os.path.exists("demo_docs"):
        os.makedirs("demo_docs")
        with open("demo_docs/sample_policy.txt", "w") as f:
            f.write("CUNY Demo Policy: All student data must remain on secure, localized servers. Public LLM APIs are strictly prohibited for processing FERPA-protected information.")
            
    # Load and chunk documents
    loader = DirectoryLoader("demo_docs", glob="**/*.txt", loader_cls=TextLoader)
    docs = loader.load()
    
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    splits = text_splitter.split_documents(docs)
    
    # Build and return the local Chroma database
    return Chroma.from_documents(documents=splits, embedding=embeddings)

vectorstore = build_vector_store()
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
                    st.info(doc.page_content)