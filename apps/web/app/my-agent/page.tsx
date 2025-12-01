// /web/app/my-agent/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, Sparkles, User, Zap } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { JobFlow } from "@/components/features/JobFlow";
import { Badge, Button, Card, Input } from "@/components/ui/Primitives";
import { AGENTS } from "@/data/agents";
import { cn } from "@/lib/ui-utils";
import type { ChatMessage } from "@/types";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Protocol initialized. I can help you analyze transactions, audit wallets, or find yield. What's your objective?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const nextMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const json = await res.json();
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: json?.message?.content ?? "I can help with that.",
        timestamp: Date.now(),
        relatedAgentId: json?.action?.type === "OPEN_AGENT" ? json.action.agentId : undefined,
        relatedInput: json?.action?.input,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, the assistant is unavailable right now.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      console.error("chat send error", err);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
        <Card className="lg:col-span-2 flex flex-col h-full border-white/10 bg-black/40 relative overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-4 max-w-[90%]", msg.role === "user" ? "ml-auto flex-row-reverse" : "")}>
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                    msg.role === "assistant"
                      ? "bg-primary/10 border-primary/20 text-primary"
                      : "bg-white/10 border-white/10 text-white",
                  )}
                >
                  {msg.role === "assistant" ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className="space-y-2">
                  <div
                    className={cn(
                      "p-3 rounded-2xl text-sm leading-relaxed",
                      msg.role === "assistant"
                        ? "bg-white/5 border border-white/5 rounded-tl-none"
                        : "bg-primary text-primary-foreground rounded-tr-none",
                    )}
                  >
                    {msg.content}
                  </div>
                  {msg.relatedAgentId && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 w-full md:w-[450px]">
                      <JobFlow agentId={msg.relatedAgentId} initialInput={msg.relatedInput} inline />
                    </motion.div>
                  )}
                </div>
              </div>
            ))}

            <AnimatePresence>
              {isTyping && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-none p-3 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce delay-75" />
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce delay-150" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-white/10 bg-black/40 backdrop-blur-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Bounty402 to analyze, decode, or audit..."
                className="bg-white/5 border-white/10 focus-visible:ring-primary/50"
              />
              <Button type="submit" size="sm" className="h-10 px-4" disabled={!input || isTyping}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </Card>

        <div className="hidden lg:flex flex-col gap-6">
          <Card className="p-5 border-white/10 bg-gradient-to-b from-white/5 to-transparent">
            <div className="flex items-center gap-2 mb-4 text-emerald-400">
              <Sparkles className="w-4 h-4" />
              <h3 className="font-semibold text-sm uppercase tracking-wider">Suggested Agents</h3>
            </div>
            <div className="space-y-3">
              {AGENTS.slice(0, 2).map((agent) => (
                <div
                  key={agent.id}
                  className="group p-3 rounded-lg border border-white/5 hover:bg-white/5 hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => setInput(`I want to use ${agent.name}`)}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-sm group-hover:text-primary transition-colors">{agent.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      ${agent.price}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{agent.description}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 border-white/10">
            <div className="flex items-center gap-2 mb-4 text-blue-400">
              <Zap className="w-4 h-4" />
              <h3 className="font-semibold text-sm uppercase tracking-wider">System Status</h3>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Network</span>
                <span className="text-emerald-400">Base Sepolia</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Escrow</span>
                <span className="text-white">Not loaded</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Gas</span>
                <span className="text-white">RPC-derived</span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="text-[10px] text-muted-foreground font-mono">
                Latest Block: —
                <br />
                Attestation Svc: —
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
