"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, AlertCircle, ArrowLeft, Bot, Check, CornerDownLeft, History, PanelRightClose, PanelRightOpen, Plus, ShieldCheck, Sparkles, Trash2, UserRound, X } from "lucide-react";

type Context = {
  workspaceId: string | null;
  collectionId: string | null;
  environmentId: string | null;
  requestId: string | null;
};
type Confirmation = {
  confirmation_id: string;
  plan_digest: string;
  expires_at: string;
  preview: Record<string, unknown>;
  workflow_name?: string;
};
type Message = {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  confirmation?: Confirmation;
  confirmationState?: "pending" | "running" | "approved" | "failed" | "cancelled";
};
type Conversation = { id: string; title: string; last_message_at: string | null };
type AuditItem = { id: string; workflow_name: string | null; method: string; resolved_host: string; status: string; duration_ms: number | null; upstream_status: number | null; outcome_summary?: Record<string, unknown> | null; created_at: string };
type PlanStep = {
  tool: string;
  operation: string;
  effect: "none" | "read" | "create" | "update" | "delete";
  arguments: Record<string, unknown>;
  requires_confirmation: boolean;
};

async function mcp(method: string, params?: Record<string, unknown>) {
  const response = await fetch("/api/ai/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, ...(params ? { params } : {}) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The MCP server could not be reached.");
  if (value.error) throw new Error(value.error.message || "The MCP request failed.");
  return value.result;
}

function toolData(result: Record<string, unknown>) {
  const content = result.structuredContent as { data?: unknown; error?: { message?: string } } | undefined;
  if (result.isError || content?.error) throw new Error(content?.error?.message || "The MCP tool could not complete the request.");
  return content?.data as Record<string, unknown>;
}

function describePlan(plan: Record<string, unknown>) {
  const steps = Array.isArray(plan.steps) ? plan.steps as PlanStep[] : [];
  if (!steps.length) return "I understood the request, but there is no safe action to run yet.";
  return steps.map((step, index) => `${index + 1}. ${step.operation}`).join("\n");
}

export default function AiAgentPanel({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: Context;
}) {
  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome",
    role: "agent",
    text: "Tell me what you need in plain language. I can inspect the active RequestLab context, run reviewed read steps, and prepare writes for your confirmation.",
  }]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [view, setView] = useState<"chat" | "history" | "audit">("chat");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, running]);

  const add = (message: Message) => setMessages((items) => [...items, message]);
  const update = (id: string, changes: Partial<Message>) =>
    setMessages((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));

  const loadConversations = async () => {
    if (!context.workspaceId) return;
    const response = await fetch(`/api/ai/conversations?workspace_id=${context.workspaceId}`, { cache: "no-store" });
    const value = await response.json();
    if (response.ok) setConversations(value.data || []);
  };
  const newChat = () => {
    setConversationId(null); setView("chat");
    setMessages([{ id: "welcome", role: "agent", text: "Start a new request. I’ll keep it separate from your previous chat." }]);
  };
  const ensureConversation = async () => {
    if (conversationId) return conversationId;
    const response = await fetch("/api/ai/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", workspace_id: context.workspaceId, collection_id: context.collectionId, environment_id: context.environmentId, request_id: context.requestId }) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message || value.error || "The chat could not be created.");
    setConversationId(value.data.id); return value.data.id as string;
  };
  const persist = async (id: string, message: Message) => {
    const response = await fetch("/api/ai/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "message", conversation_id: id, role: message.role, text: message.text }) });
    if (!response.ok) throw new Error("The chat message could not be saved.");
  };
  const openConversation = async (id: string) => {
    const response = await fetch(`/api/ai/conversations?conversation_id=${id}`, { cache: "no-store" }); const value = await response.json();
    if (response.ok) { setConversationId(id); setMessages(value.data.messages || []); setView("chat"); }
  };
  const archiveConversation = async (id: string) => {
    await fetch(`/api/ai/conversations?conversation_id=${id}`, { method: "DELETE" });
    if (conversationId === id) newChat(); await loadConversations();
  };
  const openAudit = async () => {
    if (!context.workspaceId) return;
    const response = await fetch(`/api/ai/conversations?workspace_id=${context.workspaceId}&audit=1`, { cache: "no-store" }); const value = await response.json();
    if (response.ok) setAudit(value.data || []); setView("audit");
  };

  useEffect(() => {
    setConversationId(null); setView("chat");
    setMessages([{ id: "welcome", role: "agent", text: "Tell me what you need in plain language. I can inspect the active RequestLab context, run reviewed read steps, and prepare writes for your confirmation." }]);
    if (!context.workspaceId) setConversations([]); else void loadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.workspaceId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || running) return;
    if (!context.workspaceId) {
      add({ id: crypto.randomUUID(), role: "error", text: "Choose a workspace before asking the agent to act." });
      return;
    }
    setDraft("");
    setRunning(true);
    let activeChatId: string | null = null;
    try {
      const chatId = await ensureConversation();
      activeChatId = chatId;
      const emit = async (message: Message) => { add(message); await persist(chatId, message); };
      const userMessage: Message = { id: crypto.randomUUID(), role: "user", text };
      add(userMessage);
      await persist(chatId, userMessage);
      const planning = toolData(await mcp("tools/call", {
        name: "plan_request",
        arguments: {
          message: text,
          mode: "confirm_writes",
          conversation_id: chatId,
          context: {
            workspace_id: context.workspaceId,
            collection_id: context.collectionId,
            environment_id: context.environmentId,
            request_id: context.requestId,
          },
        },
      }));
      const plan = planning.plan as Record<string, unknown>;
      const missing = Array.isArray(plan.missing_inputs) ? plan.missing_inputs.filter((item): item is string => typeof item === "string") : [];
      if (missing.length) {
        await emit({ id: crypto.randomUUID(), role: "agent", text: `I need ${missing.join(", ")} before I can continue.` });
        return;
      }
      await emit({ id: crypto.randomUUID(), role: "agent", text: `Here’s the reviewed plan:\n${describePlan(plan)}` });
      const steps = Array.isArray(plan.steps) ? plan.steps as PlanStep[] : [];
      for (const step of steps) {
        if (step.effect !== "none" && step.effect !== "read") continue;
        if (step.tool === "prepare_issue_license") {
          if (!context.collectionId || !context.environmentId) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "Choose the UAT collection and environment before I prepare this workflow." });
            return;
          }
          const nationalId = step.arguments.national_id ?? (plan.inputs as Record<string, unknown> | undefined)?.national_id;
          if (typeof nationalId !== "string" || !nationalId.trim()) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "I’m missing national_id, which is required to look up the registration." });
            return;
          }
          const prepared = toolData(await mcp("tools/call", {
            name: "prepare_issue_license",
            arguments: {
              workspace_id: context.workspaceId,
              collection_id: context.collectionId,
              environment_id: context.environmentId,
              national_id: nationalId,
            },
          })) as unknown as Confirmation;
          await emit({
            id: crypto.randomUUID(),
            role: "agent",
            text: "The UAT lookup is complete. Review the exact change below before approving it.",
            confirmation: prepared,
            confirmationState: "pending",
          });
        }
        if (step.tool === "prepare_issue_payment") {
          const args = step.arguments;
          if (!context.collectionId || !context.environmentId || typeof args.national_id !== "string" || !String(args.national_id).trim() || typeof args.service !== "string" || !String(args.service).trim()) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "Please provide national_id, service, and choose the target environment before I prepare the payment." });
            return;
          }
          const prepared = toolData(await mcp("tools/call", {
            name: "prepare_issue_payment",
            arguments: {
              workspace_id: context.workspaceId,
              collection_id: context.collectionId,
              environment_id: context.environmentId,
              national_id: args.national_id,
              service: args.service,
              target_environment: args.target_environment,
            },
          })) as unknown as Confirmation;
          await emit({
            id: crypto.randomUUID(),
            role: "agent",
            text: "The payment endpoint has been resolved and verified. Review the environment, service, record, and exact change before approving it.",
            confirmation: prepared,
            confirmationState: "pending",
          });
        }
        if (step.tool === "prepare_delete_record") {
          const args = step.arguments;
          if (!context.collectionId || !context.environmentId) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "Choose the collection and environment before I prepare this deletion." });
            return;
          }
          const nationalId = args.national_id ?? (plan.inputs as Record<string, unknown> | undefined)?.national_id;
          if (typeof nationalId !== "string" || !nationalId.trim()) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "I’m missing national_id, which is required to identify the record." });
            return;
          }
          const prepared = toolData(await mcp("tools/call", {
            name: "prepare_delete_record",
            arguments: {
              workspace_id: context.workspaceId,
              collection_id: context.collectionId,
              environment_id: context.environmentId,
              national_id: nationalId,
              target_environment: args.target_environment,
            },
          })) as unknown as Confirmation;
          await emit({
            id: crypto.randomUUID(),
            role: "agent",
            text: "The record deletion has been prepared. Review the exact environment, record, and endpoint before approving it.",
            confirmation: prepared,
            confirmationState: "pending",
          });
        }
        if (["prepare_update_status", "prepare_reissue_license", "prepare_issue_receipt"].includes(step.tool)) {
          const args = step.arguments;
          if (!context.collectionId || !context.environmentId) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "Choose the collection and environment before I prepare this workflow." });
            return;
          }
          const inputs = (plan.inputs as Record<string, unknown> | undefined) ?? {};
          const nationalId = args.national_id ?? inputs.national_id;
          if (typeof nationalId !== "string" || !nationalId.trim()) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "Please provide the national_id before I continue." });
            return;
          }
          const status = args.target_status ?? args.status ?? inputs.target_status ?? inputs.status;
          if (step.tool === "prepare_update_status" && (typeof status !== "string" || !status.trim())) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "Please provide the current and target status (for example, Status 1 to Status 2) before I continue." });
            return;
          }
          const service = args.service ?? inputs.service;
          if (step.tool === "prepare_issue_receipt" && (typeof service !== "string" || !service.trim())) {
            await emit({ id: crypto.randomUUID(), role: "agent", text: "Please provide the service for the receipt before I continue." });
            return;
          }
          const prepared = toolData(await mcp("tools/call", {
            name: step.tool,
            arguments: {
              workspace_id: context.workspaceId,
              collection_id: context.collectionId,
              environment_id: context.environmentId,
              national_id: nationalId,
              ...(status ? { status, target_status: status } : {}),
              ...(service ? { service } : {}),
              ...(args.target_environment ? { target_environment: args.target_environment } : {}),
            },
          })) as unknown as Confirmation;
          await emit({
            id: crypto.randomUUID(),
            role: "agent",
            text: "The workflow has been prepared. Review the exact record, environment, service, status transition, and endpoint before approving it.",
            confirmation: prepared,
            confirmationState: "pending",
          });
        }
      }
    } catch (error) {
      const failure: Message = { id: crypto.randomUUID(), role: "error", text: error instanceof Error ? error.message : "The agent could not complete the request." };
      add(failure);
      if (activeChatId) await persist(activeChatId, failure).catch(() => undefined);
    } finally {
      setRunning(false);
      void loadConversations();
    }
  };

  const approve = async (message: Message) => {
    if (!message.confirmation || message.confirmationState === "running") return;
    update(message.id, { confirmationState: "running" });
    try {
      const response = await fetch("/api/ai/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation_id: message.confirmation.confirmation_id,
          plan_digest: message.confirmation.plan_digest,
          idempotency_key: `${message.confirmation.workflow_name || "reviewed-write"}:${crypto.randomUUID()}`,
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message || value.error || "The confirmed write failed.");
      update(message.id, { confirmationState: "approved" });
      const details = value.data.workflow_name === "issue_payment"
        ? ` Payment for ${value.data.service} in ${value.data.environment} on national ID ${value.data.national_id} ${value.data.status === "succeeded" ? "succeeded" : "failed"}. Host: ${value.data.host}.`
        : "";
      const reply: Message = { id: crypto.randomUUID(), role: "agent", text: `Completed safely. Execution ${value.data.execution_id} finished with status ${value.data.status}.${details}` };
      add(reply);
      if (conversationId) await persist(conversationId, reply);
    } catch (error) {
      update(message.id, { confirmationState: "failed" });
      const failure: Message = { id: crypto.randomUUID(), role: "error", text: error instanceof Error ? error.message : "The confirmed write failed." };
      add(failure); if (conversationId) await persist(conversationId, failure).catch(() => undefined);
    }
  };

  if (!open) {
    return (
      <aside className="ai-agent ai-agent-collapsed" aria-label="AI agent">
        <button onClick={() => onOpenChange(true)} aria-label="Open AI agent" title="Open AI agent">
          <Sparkles size={18} /><span>AI</span><PanelRightOpen size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="ai-agent" aria-label="AI agent">
      <header>
        <div><span className="ai-agent-mark"><Sparkles size={16} /></span><div><strong>AI Agent</strong><small>RequestLab MCP</small></div></div>
        <div className="ai-agent-header-actions">
          <button className="icon-button" onClick={newChat} aria-label="New chat" title="New chat"><Plus size={17} /></button>
          <button className="icon-button" onClick={() => { void loadConversations(); setView("history"); }} aria-label="Chat history" title="Chat history"><History size={17} /></button>
          <button className="icon-button" onClick={() => void openAudit()} aria-label="Execution audit" title="Execution audit"><Activity size={17} /></button>
          <button className="icon-button" onClick={() => onOpenChange(false)} aria-label="Collapse AI agent" title="Collapse AI agent"><PanelRightClose size={18} /></button>
        </div>
      </header>
      <div className="ai-agent-context" aria-label="Agent context">
        <span className={context.environmentId ? "ready" : ""}>{context.environmentId ? <Check size={12} /> : <AlertCircle size={12} />}{context.environmentId ? "Environment selected" : "No environment"}</span>
      </div>
      {view !== "chat" && <div className="ai-agent-subhead"><button onClick={() => setView("chat")}><ArrowLeft size={14} />Chat</button><strong>{view === "history" ? "Chat history" : "Execution audit"}</strong></div>}
      <div className="ai-agent-log" ref={logRef} role="log" aria-live="polite">
        {view === "history" && <div className="ai-history">{conversations.length === 0 ? <p>No saved chats in this workspace.</p> : conversations.map((item) => <div key={item.id}><button onClick={() => void openConversation(item.id)}><strong>{item.title}</strong><small>{item.last_message_at ? new Date(item.last_message_at).toLocaleString() : "Empty chat"}</small></button><button onClick={() => void archiveConversation(item.id)} aria-label={`Archive ${item.title}`}><Trash2 size={14} /></button></div>)}</div>}
        {view === "audit" && <div className="ai-audit">{audit.length === 0 ? <p>No executions in this workspace.</p> : audit.map((item) => <article key={item.id}><div><strong>{item.workflow_name || `${item.method} request`}</strong><span className={item.status}>{item.status}</span></div><small>{item.method} · {item.resolved_host}</small>{item.workflow_name === "issue_payment" && item.outcome_summary && <small>{String(item.outcome_summary.service || "Payment")} · {String(item.outcome_summary.environment || "Unknown environment")} · ID {String(item.outcome_summary.national_id || "—")}</small>}<small>{item.upstream_status || "—"} · {item.duration_ms ?? "—"} ms · {new Date(item.created_at).toLocaleString()}</small></article>)}</div>}
        {view === "chat" && messages.map((message) => (
          <article className={`ai-message ${message.role}`} key={message.id}>
            <span className="ai-message-icon">{message.role === "user" ? <UserRound size={15} /> : message.role === "error" ? <AlertCircle size={15} /> : <Bot size={15} />}</span>
            <div>
              <p>{message.text}</p>
              {message.confirmation && (
                <section className="ai-confirmation" aria-label="Write confirmation">
                  <div className="ai-confirmation-title"><ShieldCheck size={17} /><strong>Confirmation required</strong></div>
                  <dl>
                    {Object.entries(message.confirmation.preview).map(([key, value]) => (
                      <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>
                    ))}
                  </dl>
                  <div className="ai-confirmation-actions">
                    <button className="secondary" disabled={message.confirmationState !== "pending"} onClick={() => update(message.id, { confirmationState: "cancelled" })}><X size={14} />{message.confirmationState === "cancelled" ? "Cancelled" : "Cancel"}</button>
                    <button className="primary" disabled={message.confirmationState !== "pending"} onClick={() => void approve(message)}>
                      <ShieldCheck size={14} />{message.confirmationState === "running" ? "Approving…" : message.confirmationState === "approved" ? "Approved" : message.confirmationState === "failed" ? "Failed" : "Approve write"}
                    </button>
                  </div>
                </section>
              )}
            </div>
          </article>
        ))}
        {running && <article className="ai-message agent"><span className="ai-message-icon"><Bot size={15} /></span><div className="ai-thinking"><i /><i /><i /><span>Reviewing context and tools…</span></div></article>}
      </div>
      <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <label htmlFor="ai-agent-input">Describe what you need</label>
        <textarea id="ai-agent-input" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
        }} placeholder="Issue a license, or delete a record by national_id…"
          disabled={running} />
        <div><span>Enter to send · Shift+Enter for a new line</span><button type="submit" aria-label="Send to AI agent" disabled={running || !draft.trim()}><CornerDownLeft size={16} /></button></div>
      </form>
    </aside>
  );
}
