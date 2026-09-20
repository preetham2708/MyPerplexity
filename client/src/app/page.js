
"use client";
 
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
 
const API_BASE = "http://127.0.0.1:8000";
 
function AttachMenu({ open, onClose, onPick }) {
  if (!open) return null;
  return (
    <div className="absolute bottom-14 left-0 w-72 bg-white border border-[#E2E0D6] rounded-xl shadow-lg py-2 z-20">
      <button
        onClick={() => { onPick(); onClose(); }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#1B1B18] hover:bg-[#F6F5F1] transition-colors"
      >
        <span className="text-lg">📎</span> Add documents or images
      </button>
      <div className="border-t border-[#EBEAE4] my-2" />
      <p className="px-4 py-1 text-[11px] uppercase tracking-wide text-[#A6A69C]">
        Built-in capabilities
      </p>
      <div className="px-4 py-1.5 text-sm text-[#4A4A44] flex items-center gap-2">
        <span className="text-[#4C9F70]">✓</span> Web search
      </div>
      <div className="px-4 py-1.5 text-sm text-[#4A4A44] flex items-center gap-2">
        <span className="text-[#4C9F70]">✓</span> Document retrieval (RAG)
      </div>
      <div className="px-4 py-1.5 text-sm text-[#4A4A44] flex items-center gap-2">
        <span className="text-[#4C9F70]">✓</span> Calculator
      </div>
      <div className="px-4 py-1.5 text-sm text-[#4A4A44] flex items-center gap-2">
        <span className="text-[#4C9F70]">✓</span> Persistent memory
      </div>
    </div>
  );
}
 
// Defined OUTSIDE Home so React never remounts it on Home's re-renders
// (fixes the "file select does nothing" bug from an earlier iteration)
function InputBar({
  autoFocus,
  input,
  setInput,
  handleKeyDown,
  sendMessage,
  loading,
  pendingFiles,
  removePendingFile,
  attachMenuOpen,
  setAttachMenuOpen,
  fileInputRef,
  handleFileSelect,
}) {
  const textareaRef = useRef(null);
 
  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };
 
  useEffect(() => {
    autoGrow();
  }, [input]);
 
  return (
    <div className="w-full max-w-2xl relative">
      {pendingFiles && pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingFiles.map((f, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-[#EBEEF6] text-[#2F4B7C] text-sm px-3 py-1.5 rounded-full w-fit"
            >
              <span>{/\.(png|jpe?g)$/i.test(f.name) ? "🖼️" : "📄"}</span>
              <span className="max-w-[180px] truncate">{f.name}</span>
              <button onClick={() => removePendingFile(idx)} className="text-[#5B6BA8] hover:text-[#C0392B] ml-1">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
 
      <AttachMenu
        open={attachMenuOpen}
        onClose={() => setAttachMenuOpen(false)}
        onPick={() => fileInputRef.current?.click()}
      />
 
      <div className="flex items-end gap-2 bg-white border border-[#E2E0D6] rounded-3xl pl-2 pr-2 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[#2F4B7C]/25 focus-within:border-[#2F4B7C]">
        <button
          onClick={() => setAttachMenuOpen((v) => !v)}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F1F0EA] text-xl transition-colors self-end"
          title="Add documents or images"
          disabled={loading}
        >
          +
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 bg-transparent px-2 py-2 text-base focus:outline-none placeholder:text-[#A6A69C] resize-none max-h-40 overflow-y-auto"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingFiles?.length ? "Add a message (optional)…" : "Ask anything…"}
          disabled={loading}
          autoFocus={autoFocus}
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading}
          className="shrink-0 bg-[#2F4B7C] hover:bg-[#26406B] text-white px-6 py-2.5 rounded-full text-sm font-medium disabled:opacity-40 transition-colors self-end"
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
 
export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState("web-session-1");
  const [threads, setThreads] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
 
  useEffect(() => {
    fetchThreads();
  }, []);
 
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
 
  const fetchThreads = async () => {
    try {
      const res = await fetch(`${API_BASE}/threads`);
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (err) {
      console.error("Failed to fetch threads:", err);
    }
  };
 
  // Load a past conversation's full message history when clicked
  const openThread = async (t) => {
    setThreadId(t);
    setFollowUps([]);
    try {
      const res = await fetch(`${API_BASE}/threads/${t}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to load conversation:", err);
      setMessages([]);
    }
  };
 
  const deleteThread = async (t, e) => {
    e.stopPropagation();
    await fetch(`${API_BASE}/threads/${t}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((x) => x !== t));
    if (t === threadId) startNewChat();
  };
 
  const generateFollowUps = () => [
    "Explain that in more detail",
    "What are the sources?",
    "Summarize in one line",
  ];
 
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };
 
  const removePendingFile = (idx) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };
 
  // Uploads ALL pending files in ONE request — matches backend's
  // /upload endpoint which accepts `files: list[UploadFile]`
  const uploadAllFiles = async (files) => {
    const summaryLine = files.map((f) => f.name).join(", ");
    setMessages((prev) => [
      ...prev,
      { role: "system", icon: "📎", content: `Uploading ${files.length} file(s): ${summaryLine}…` },
    ]);
 
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
 
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
      const data = await res.json();
 
      const lines = data.files.map((r) => {
        const icon = r.type === "image" ? "🖼️" : r.type === "pdf" ? "📄" : "❓";
        if (r.status === "success") return `${icon} "${r.filename}" indexed`;
        if (r.status === "no_text") return `${icon} "${r.filename}" — no readable text found`;
        if (r.status === "ocr_unavailable") return `${icon} "${r.filename}" saved — image OCR needs Tesseract installed`;
        return `${icon} "${r.filename}" — unsupported file type`;
      });
 
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1].content =
          lines.join("\n") + `\n\nKnowledge base now has ${data.total_chunks} chunks total. Ask me anything about these files.`;
        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1].content = "Upload failed.";
        return updated;
      });
    }
  };
 
  const sendMessage = async (customInput) => {
    const messageText = customInput || input;
    const filesToUpload = pendingFiles;
 
    if (!messageText.trim() && filesToUpload.length === 0) return;
 
    setInput("");
    setPendingFiles([]);
    setFollowUps([]);
 
    if (filesToUpload.length > 0) {
      await uploadAllFiles(filesToUpload);
    }
 
    if (!messageText.trim()) {
      fetchThreads();
      return;
    }
 
    setMessages((prev) => [...prev, { role: "user", content: messageText }]);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", toolsUsed: [], sources: [] }]);
 
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messageText, thread_id: threadId }),
    });
 
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let finalContent = "";
 
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
 
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.replace("data: ", "");
        try {
          const event = JSON.parse(raw);
          if (event.type === "token") {
            finalContent += event.content;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1].content = finalContent;
              return updated;
            });
          } else if (event.type === "meta") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1].toolsUsed = event.tools_used;
              updated[updated.length - 1].sources = event.sources;
              return updated;
            });
          }
        } catch (e) {}
      }
    }
 
    setFollowUps(generateFollowUps());
    setLoading(false);
    fetchThreads();
  };
 
  // Enter sends; Shift+Enter inserts a new line (native textarea behavior)
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
 
  const startNewChat = () => {
    setThreadId(`session-${Date.now()}`);
    setMessages([]);
    setFollowUps([]);
    setPendingFiles([]);
  };
 
  const isEmpty = messages.length === 0;
 
  const inputBarProps = {
    input,
    setInput,
    handleKeyDown,
    sendMessage,
    loading,
    pendingFiles,
    removePendingFile,
    attachMenuOpen,
    setAttachMenuOpen,
    fileInputRef,
    handleFileSelect,
  };
 
  return (
    <div className="flex h-screen bg-[#FAFAF8] text-[#1B1B18]">
      <aside className="w-72 bg-[#15181F] text-[#D6D4CB] flex flex-col shrink-0">
        <div className="px-5 pt-7 pb-5">
          <h1 className="font-[Lora] italic text-xl text-white flex items-center gap-2">
            <span className="text-[#8EA3D6]">✳</span> My Perplexity
          </h1>
        </div>
 
        <div className="px-5 pb-4">
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 bg-[#2F4B7C] hover:bg-[#3A5A94] text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            <span>+</span> New chat
          </button>
        </div>
 
        <div className="flex-1 overflow-y-auto px-3">
          <p className="text-[11px] uppercase tracking-wide text-[#5E6272] px-2 mb-2 mt-2">
            Conversations
          </p>
          <div className="space-y-0.5">
            {threads.length === 0 && (
              <p className="text-sm text-[#5E6272] px-2 py-2">No conversations yet</p>
            )}
            {threads.map((t) => (
              <div
                key={t}
                className={`flex items-center justify-between rounded-md group px-3 py-2 text-sm cursor-pointer transition-colors ${
                  t === threadId ? "bg-[#232733] text-white" : "text-[#9A9CA8] hover:bg-[#1D212B] hover:text-white"
                }`}
                onClick={() => openThread(t)}
              >
                <span className="truncate">{t}</span>
                <button
                  onClick={(e) => deleteThread(t, e)}
                  className="text-[#5E6272] hover:text-[#E27D7D] opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
 
        <div className="px-5 py-4 border-t border-[#262A34] text-[11px] text-[#5E6272]">
          LangGraph · RAG · Multi-tool agent
        </div>
      </aside>
 
      <div className="flex-1 flex flex-col items-center min-w-0">
        {isEmpty ? (
          <div className="flex-1 w-full flex flex-col items-center justify-center px-6">
            <div className="animate-[fadeInUp_0.9s_ease-out] flex flex-col items-center">
              <span className="text-5xl mb-5">✳</span>
              <h2 className="font-[Lora] italic text-[2.75rem] leading-tight text-[#1B1B18] mb-3 text-center">
                Welcome to My Perplexity
              </h2>
              <p className="text-[#6B6B63] text-lg mb-10 max-w-lg text-center leading-relaxed">
                An AI research assistant that searches the web, reads your
                documents, and reasons through problems — all in one place.
              </p>
              <InputBar autoFocus {...inputBarProps} />
 
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                <span className="text-xs text-[#4A4A44] bg-white border border-[#E2E0D6] rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  🌐 Web search
                </span>
                <span className="text-xs text-[#4A4A44] bg-white border border-[#E2E0D6] rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  📄 Document RAG
                </span>
                <span className="text-xs text-[#4A4A44] bg-white border border-[#E2E0D6] rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  🧮 Calculator
                </span>
                <span className="text-xs text-[#4A4A44] bg-white border border-[#E2E0D6] rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  💾 Persistent memory
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col w-full h-full items-center">
            <div className="flex-1 overflow-y-auto w-full">
              <div className="max-w-2xl mx-auto px-6 py-10">
                <div className="space-y-8">
                  {messages.map((msg, i) => (
                    <div key={i}>
                      {msg.role === "user" && (
                        <div className="flex justify-end">
                          <div className="bg-[#2F4B7C] text-white px-5 py-3 rounded-2xl max-w-lg text-base leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        </div>
                      )}
 
                      {msg.role === "system" && (
                        <div className="flex justify-center">
                          <div className="flex items-center gap-3 bg-white border border-[#E2E0D6] px-5 py-3 rounded-xl shadow-sm max-w-md">
                            <span className="text-2xl">{msg.icon || "📎"}</span>
                            <p className="text-sm text-[#4A4A44] whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      )}
 
                      {msg.role === "assistant" && (
                        <div>
                          <div className="text-base leading-[1.75] prose prose-base max-w-none prose-p:my-3 prose-headings:font-[Lora] prose-table:text-sm prose-th:bg-[#F1F0EA] prose-strong:text-[#1B1B18]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                              {msg.content || "…"}
                            </ReactMarkdown>
                          </div>
 
                          {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                              {msg.toolsUsed.map((tool, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs font-[IBM_Plex_Mono] text-[#5B6BA8] bg-[#EBEEF6] px-2.5 py-1 rounded-full"
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          )}
 
                          {msg.sources && msg.sources.length > 0 && (
                            <p className="text-xs font-[IBM_Plex_Mono] text-[#A6A69C] mt-3">
                              source — {msg.sources.join(", ")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
 
                  {followUps.length > 0 && !loading && (
                    <div className="flex flex-wrap gap-2">
                      {followUps.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(q)}
                          className="text-sm text-[#2F4B7C] border border-[#E2E0D6] rounded-full px-4 py-2 hover:bg-[#EBEEF6] hover:border-[#2F4B7C] transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div ref={scrollRef} />
              </div>
            </div>
 
            <div className="border-t border-[#EBEAE4] bg-[#FAFAF8] px-6 py-5 w-full flex justify-center">
              <InputBar autoFocus={false} {...inputBarProps} />
            </div>
          </div>
        )}
      </div>
 
      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
