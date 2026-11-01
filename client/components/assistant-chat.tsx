"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ApiClientError, post } from "@/lib/api";
import { cn } from "cn";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const suggestions = [
  "What is on my timetable?",
  "Show me the published exam schedule.",
  "What is the status of my recent requests?",
];

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending, open]);

  const sendMessage = async (content: string) => {
    const text = content.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setError("");
    setSending(true);

    try {
      const { reply } = await post<{ reply: string }>("/api/assistant/chat", {
        messages: updatedMessages.slice(-8),
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : "The assistant could not respond. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      {open ? (
        <section
          aria-label="CIT Scheduler assistant"
          className="mb-3 flex h-[min(620px,calc(100dvh-7rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-2xl shadow-indigo-950/20"
        >
          <header className="flex items-center justify-between bg-linear-to-r from-indigo-700 to-violet-700 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <Bot aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-sm font-bold">
                  Scheduler assistant
                </h2>
                <p className="mt-0.5 text-xs text-indigo-100">
                  Answers from your scheduler data
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="flex size-9 items-center justify-center rounded-xl text-indigo-100 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </header>

          <div
            ref={transcriptRef}
            aria-live="polite"
            className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4"
          >
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col justify-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                  <Sparkles aria-hidden="true" className="size-6" />
                </div>
                <p className="text-center text-sm font-semibold text-slate-800">
                  What can I help you find?
                </p>
                <p className="mt-1 mb-5 text-center text-xs leading-relaxed text-slate-500">
                  Ask about published schedules or your own requests and job
                  status.
                </p>
                <div className="space-y-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void sendMessage(suggestion)}
                      disabled={sending}
                      className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-left text-xs font-medium text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-60"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${index}-${message.role}`}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[88%] min-w-0 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed [&_a]:text-indigo-700 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-200 [&_blockquote]:pl-3 [&_code]:break-all [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:font-semibold [&_li+li]:mt-1 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-2 [&_pre_code]:break-normal [&_strong]:font-semibold [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border-b [&_td]:px-2 [&_td]:py-1 [&_th]:border-b [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
                      message.role === "user"
                        ? "rounded-br-md bg-indigo-600 text-white"
                        : "rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-sm",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            {sending ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin text-indigo-600"
                />
                Checking scheduler data…
              </div>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700"
              >
                {error}
              </p>
            ) : null}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
          >
            <label className="sr-only" htmlFor="assistant-message">
              Ask the scheduler assistant
            </label>
            <textarea
              id="assistant-message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={2_000}
              rows={1}
              placeholder="Ask about your schedule…"
              className="max-h-28 min-h-10 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <Send aria-hidden="true" className="size-4" />
              )}
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={
          open ? "Close scheduler assistant" : "Open scheduler assistant"
        }
        className="ml-auto flex h-12 items-center gap-2 rounded-full bg-indigo-700 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-950/25 transition hover:-translate-y-0.5 hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
      >
        {open ? (
          <X aria-hidden="true" className="size-5" />
        ) : (
          <Bot aria-hidden="true" className="size-5" />
        )}
        <span>{open ? "Close" : "Ask assistant"}</span>
      </button>
    </div>
  );
}
