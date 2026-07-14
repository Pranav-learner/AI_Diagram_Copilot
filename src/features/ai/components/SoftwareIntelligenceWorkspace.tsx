import React, { useState, useEffect, useRef, useContext } from 'react';
import {
  Database,
  Terminal,
  Play,
  RefreshCw,
  Sparkles,
  Send,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  Search,
  FileText,
  Info,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Clock,
  Key,
  ArrowRight,
  Zap,
  Code,
  Layers,
  Upload,
} from 'lucide-react';
import { useProjectIntelligenceStore } from '../store/useProjectIntelligenceStore';
import { SAMPLE_PROJECTS } from '../store/sampleRepositories';
import { AIGenerationContext } from '../AIGenerationContext';
import { Markdown } from './Markdown';
import type { DiagramPlan } from '@/ai/generation/model/DiagramPlan';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  timeline?: { stage: string; status: 'pending' | 'active' | 'done' }[];
  evidence?: { source: string; origin: string; location?: string; confidence: number; method: string }[];
}

export function SoftwareIntelligenceWorkspace() {
  const store = useProjectIntelligenceStore();
  const context = useContext(AIGenerationContext);
  const generator = context?.generator;

  // UI view selectors
  const [centerTab, setCenterTab] = useState<'explorer' | 'map'>('explorer');
  const [rightTab, setRightTab] = useState<'chat' | 'observability'>('chat');
  const [selectedOntology, setSelectedOntology] = useState<string>('all');
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
  
  // Custom file upload simulator state
  const [customFileCount, setCustomFileCount] = useState(0);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [activeTimeline, setActiveTimeline] = useState<any[]>([]);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [store.importLogs, store.importProgress]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, activeTimeline]);

  // Load a default sample project if none loaded
  useEffect(() => {
    if (store.importStatus === 'idle' && !store.pim) {
      store.loadSampleProject('ecommerce');
    }
  }, []);

  const handleCustomFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadedFiles: { path: string; content: string }[] = [];
    let processed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const reader = new FileReader();
      reader.onload = (event) => {
        uploadedFiles.push({
          path: file.name,
          content: (event.target?.result as string) || '',
        });
        processed++;
        if (processed === files.length) {
          store.importFiles(uploadedFiles, 'custom');
          setCustomFileCount(files.length);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = chatInput.trim();
    if (!query || isGeneratingResponse) return;

    setChatInput('');
    setIsGeneratingResponse(true);

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };

    setChatHistory((prev) => [...prev, userMsg]);

    // Initialize timeline stages
    const stages = [
      { stage: 'Intent Analyzer', status: 'active' },
      { stage: 'Context Builder', status: 'pending' },
      { stage: 'Planning', status: 'pending' },
      { stage: 'Query Execution', status: 'pending' },
      { stage: 'Evidence Compilation', status: 'pending' },
      { stage: 'Response Generation', status: 'pending' },
    ];
    setActiveTimeline(stages);

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const startTime = Date.now();

    // Stage 1: Intent
    await delay(350);
    setActiveTimeline([
      { stage: 'Intent Analyzer', status: 'done' },
      { stage: 'Context Builder', status: 'active' },
      { ...stages[2]! }, { ...stages[3]! }, { ...stages[4]! }, { ...stages[5]! }
    ]);

    // Stage 2: Context
    await delay(400);
    setActiveTimeline([
      { stage: 'Intent Analyzer', status: 'done' },
      { stage: 'Context Builder', status: 'done' },
      { stage: 'Planning', status: 'active' },
      { ...stages[3]! }, { ...stages[4]! }, { ...stages[5]! }
    ]);

    // Stage 3: Planning
    await delay(300);
    setActiveTimeline([
      { stage: 'Intent Analyzer', status: 'done' },
      { stage: 'Context Builder', status: 'done' },
      { stage: 'Planning', status: 'done' },
      { stage: 'Query Execution', status: 'active' },
      { ...stages[4]! }, { ...stages[5]! }
    ]);

    // Stage 4: Query execution
    await delay(500);
    setActiveTimeline([
      { stage: 'Intent Analyzer', status: 'done' },
      { stage: 'Context Builder', status: 'done' },
      { stage: 'Planning', status: 'done' },
      { stage: 'Query Execution', status: 'done' },
      { stage: 'Evidence Compilation', status: 'active' },
      { ...stages[5]! }
    ]);

    // Stage 5: Evidence compile
    await delay(300);
    setActiveTimeline([
      { stage: 'Intent Analyzer', status: 'done' },
      { stage: 'Context Builder', status: 'done' },
      { stage: 'Planning', status: 'done' },
      { stage: 'Query Execution', status: 'done' },
      { stage: 'Evidence Compilation', status: 'done' },
      { stage: 'Response Generation', status: 'active' },
    ]);

    // Stage 6: Response generation & finalize
    await delay(400);
    setActiveTimeline([]);

    // Query mock assistant provider logic directly in browser
    const mockService = store.engine;
    let answerText = '';
    let evidenceList: any[] = [];

    if (store.pim) {
      // Find matching entity
      const lower = query.toLowerCase();
      const entity = store.pim.entities().find(
        (e) => lower.includes(e.name.toLowerCase()) || e.aliases.some((a) => lower.includes(a.toLowerCase()))
      );

      if (entity) {
        evidenceList = entity.evidence.map((ev) => ({
          source: ev.source || 'Unknown',
          origin: ev.origin,
          location: ev.location,
          confidence: ev.confidence,
          method: ev.method || 'AST Parse',
        }));
      }

      // Execute response generation
      const systemPrompt = 'Project Intelligence System Prompt';
      const response = await fetch('/api/dummy', { method: 'POST', body: JSON.stringify({ prompt: query }) }).catch(() => null);
      
      // Generate answer text using our local provider implementation helper
      const provider = new (await import('../../project-intelligence/MockProjectIntelligenceProvider')).MockProjectIntelligenceProvider();
      const mockRequest = {
        model: 'gemini-3.1-pro',
        messages: [
          { role: 'system', content: 'Project Intelligence Copilot' },
          { role: 'user', content: query }
        ]
      };
      const result = await provider.complete(mockRequest as any);
      answerText = result.text;
    } else {
      answerText = '### ⚠️ No Project Ingested\nPlease load a project first.';
    }

    const latency = Date.now() - startTime;
    const tokens = Math.round(answerText.length / 3);

    // Record metrics in the store
    store.recordQueryMetrics(latency, tokens, true, Math.random() > 0.3);

    const assistantMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'assistant',
      content: answerText,
      timestamp: Date.now(),
      evidence: evidenceList,
    };

    setChatHistory((prev) => [...prev, assistantMsg]);
    setIsGeneratingResponse(false);
  };

  const handleGenerateDiagram = () => {
    if (!store.pim || !generator) return;

    try {
      const plan: DiagramPlan = {
        diagramType: 'architecture',
        title: `${store.pim.entities().length} Node Microservice Topology`,
        description: 'Auto-generated visual map from the Project Intelligence Model.',
        layout: 'horizontal',
        nodes: store.pim.entities().map((e) => ({
          id: e.id,
          label: e.name,
          type: e.kind,
          description: e.description,
          metadata: { category: e.category, confidence: e.confidence },
        })),
        relationships: store.pim.relations().map((r) => ({
          source: r.source,
          target: r.target,
          label: r.kind,
          type: 'flow',
        })),
      };

      const ctx = generator.executionPlanner.computeLayout(plan);
      const execution = generator.executionPlanner.compile(plan, ctx);
      generator.gateway.apply(execution.operations);

      // Return user to Canvas tab to review the generated diagram
      store.setActiveTab('canvas');
    } catch (e) {
      console.error('Failed to auto-generate diagram on canvas', e);
    }
  };

  const getBlastRadius = (entityId: string): string[] => {
    if (!store.engine) return [];
    return store.engine.query().downstreamImpact(entityId).map((e) => e.id);
  };

  const filteredEntities = store.pim
    ? store.pim.entities().filter((e) => {
        if (selectedOntology === 'all') return true;
        return e.ontologyType.toLowerCase() === selectedOntology.toLowerCase() || e.kind.toLowerCase() === selectedOntology.toLowerCase();
      })
    : [];

  const blastRadiusIds = hoveredEntity ? getBlastRadius(hoveredEntity) : [];

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      {/* ── Left Column: Ingestion Controller ── */}
      <div className="flex w-80 shrink-0 flex-col border-r bg-muted/10">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <Terminal className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Pipeline Ingestion</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Sample Loader */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Load Sample Project
            </label>
            <div className="grid grid-cols-1 gap-2">
              {SAMPLE_PROJECTS.map((proj) => (
                <button
                  key={proj.id}
                  onClick={() => store.loadSampleProject(proj.id as any)}
                  disabled={store.importStatus === 'importing'}
                  className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${
                    store.activeProjectId === proj.id ? 'border-primary/50 bg-primary/5' : 'bg-background'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    <Database className="size-3.5 text-primary" />
                    {proj.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground line-clamp-2 leading-normal">
                    {proj.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Custom File Upload */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Upload Custom Source
            </label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-muted/30 transition-all border-muted-foreground/30">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="size-5 text-muted-foreground mb-1" />
                  <p className="text-[11px] text-muted-foreground">Select source code files</p>
                </div>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleCustomFileUpload}
                  disabled={store.importStatus === 'importing'}
                />
              </label>
            </div>
            {customFileCount > 0 && store.activeProjectId === 'custom' && (
              <p className="text-[10px] text-primary text-center">
                Ingested {customFileCount} files successfully.
              </p>
            )}
          </div>

          {/* Ingestion Timeline & Logs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pipeline Timeline & Logs
              </label>
              {store.importStatus === 'importing' && (
                <RefreshCw className="size-3 animate-spin text-primary" />
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>{store.importStatus.toUpperCase()}</span>
                <span>{store.importProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${store.importProgress}%` }}
                />
              </div>
            </div>

            {/* Terminal Console Logs */}
            <div className="relative rounded-lg bg-zinc-950 p-3 font-mono text-[9px] leading-relaxed text-zinc-400 border border-zinc-800">
              <div className="h-44 overflow-y-auto space-y-1.5 scrollbar-thin">
                {store.importLogs.map((log, idx) => {
                  let colorClass = 'text-zinc-400';
                  if (log.startsWith('❌')) colorClass = 'text-red-400';
                  else if (log.startsWith('[PIM]')) colorClass = 'text-emerald-400 font-bold';
                  else if (log.startsWith('[FusionEngine]')) colorClass = 'text-blue-400';
                  else if (log.startsWith('[AST]')) colorClass = 'text-amber-400';

                  return (
                    <div key={idx} className={colorClass}>
                      {log}
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Center Column: Ontology Explorer & Capability Map ── */}
      <div className="flex flex-1 flex-col min-w-0 border-r">
        <div className="flex h-12 items-center justify-between border-b px-4 shrink-0 bg-background/50 backdrop-blur">
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 text-xs font-medium">
            <button
              onClick={() => setCenterTab('explorer')}
              className={`rounded-md px-3 py-1 transition-all ${
                centerTab === 'explorer' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Ontology Explorer
            </button>
            <button
              onClick={() => setCenterTab('map')}
              className={`rounded-md px-3 py-1 transition-all ${
                centerTab === 'map' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Capability Map
            </button>
          </div>

          {store.pim && (
            <button
              onClick={handleGenerateDiagram}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow transition-all hover:bg-primary/95"
            >
              <Sparkles className="size-3.5" />
              Generate Diagram
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {centerTab === 'explorer' ? (
            <div className="space-y-4">
              {/* Ontology Pills */}
              <div className="flex flex-wrap gap-1.5">
                {['all', 'Service', 'Database', 'API', 'Queue', 'Infrastructure'].map((ot) => (
                  <button
                    key={ot}
                    onClick={() => setSelectedOntology(ot)}
                    className={`rounded-full px-3 py-1 text-xs transition-all ${
                      selectedOntology === ot
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {ot}
                  </button>
                ))}
              </div>

              {/* Entity List */}
              <div className="space-y-3">
                {filteredEntities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                    <Info className="size-8 mb-2 stroke-1" />
                    <p className="text-sm">No PIM entities found for this category.</p>
                  </div>
                ) : (
                  filteredEntities.map((entity) => {
                    const isExpanded = expandedEntity === entity.id;
                    return (
                      <div
                        key={entity.id}
                        className={`rounded-xl border transition-all ${
                          isExpanded ? 'border-primary bg-primary/5' : 'bg-background hover:border-muted-foreground/30'
                        }`}
                      >
                        {/* Header */}
                        <div
                          onClick={() => setExpandedEntity(isExpanded ? null : entity.id)}
                          className="flex cursor-pointer items-center justify-between p-4"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                              <Code className="size-4 text-muted-foreground" />
                            </div>
                            <div>
                              <h4 className="font-bold text-sm">{entity.name}</h4>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                Ontology: {entity.ontologyType} · Confidence: {(entity.confidence * 100).toFixed(0)}%
                              </p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </div>

                        {/* Details */}
                        {isExpanded && (
                          <div className="border-t px-4 py-3 space-y-3 text-xs leading-normal">
                            {entity.description && (
                              <p className="text-muted-foreground leading-relaxed">{entity.description}</p>
                            )}

                            {/* Attributes */}
                            {Object.keys(entity.attributes).length > 0 && (
                              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3">
                                {Object.entries(entity.attributes).map(([k, v]) => (
                                  <div key={k} className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">{k}</span>
                                    <span className="font-mono text-xs">{String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Evidence Citations */}
                            <div className="space-y-2">
                              <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                                Grounded Evidence List
                              </span>
                              <div className="space-y-1.5">
                                {entity.evidence.map((ev, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between rounded bg-background p-2 border font-mono text-[10px]"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      <FileText className="size-3 text-primary shrink-0" />
                                      <span className="truncate text-muted-foreground">{ev.source || 'Unknown'}</span>
                                      {ev.location && <span className="text-foreground">L{ev.location}</span>}
                                    </div>
                                    <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                      {ev.origin} ({ev.method || 'AST'})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            // Capability Map & Dependency Viewer
            <div className="space-y-6">
              <div className="flex items-center gap-2 rounded-xl bg-primary/5 p-4 border border-primary/20 text-xs">
                <Info className="size-4 text-primary shrink-0" />
                <p className="leading-relaxed">
                  <strong>Downstream Blast Radius:</strong> Hover over any service node to highlight all downstream
                  components impacted by API changes or outage. Click <strong>Generate Diagram</strong> above to render
                  the model visual layout.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {store.pim?.entities().map((entity) => {
                  const isHovered = hoveredEntity === entity.id;
                  const isImpacted = blastRadiusIds.includes(entity.id);

                  return (
                    <div
                      key={entity.id}
                      onMouseEnter={() => setHoveredEntity(entity.id)}
                      onMouseLeave={() => setHoveredEntity(null)}
                      className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all ${
                        isHovered
                          ? 'border-primary bg-primary/5 shadow-md scale-[1.01]'
                          : isImpacted
                          ? 'border-red-500/50 bg-red-500/5 shadow-inner'
                          : 'bg-background'
                      }`}
                    >
                      {isImpacted && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-red-500 uppercase tracking-wider font-mono">
                          <ShieldAlert className="size-2.5" />
                          Impacted Node
                        </div>
                      )}

                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">
                          {entity.ontologyType}
                        </span>
                        <h4 className="font-bold text-sm text-foreground">{entity.name}</h4>
                        {entity.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {entity.description}
                          </p>
                        )}
                      </div>

                      {/* Outgoing relationships list */}
                      {store.pim && (
                        <div className="mt-4 pt-3 border-t border-dashed space-y-1.5">
                          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Dependencies:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {store.pim
                              .relations()
                              .filter((r) => r.source === entity.id)
                              .map((r) => {
                                const targetName = store.pim?.getEntity(r.target)?.name || r.target;
                                return (
                                  <span
                                    key={r.id}
                                    className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[9px] font-mono"
                                  >
                                    {r.kind === 'dependsOn' ? 'uses' : r.kind}
                                    <ArrowRight className="size-2 text-muted-foreground" />
                                    {targetName}
                                  </span>
                                );
                              })}
                            {store.pim.relations().filter((r) => r.source === entity.id).length === 0 && (
                              <span className="text-[10px] text-muted-foreground italic">None (Leaf component)</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Column: Semantic QA Copilot & Observability ── */}
      <div className="flex w-96 shrink-0 flex-col bg-muted/10">
        <div className="flex h-12 items-center justify-between border-b px-4 bg-background/50 backdrop-blur">
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 text-xs font-medium">
            <button
              onClick={() => setRightTab('chat')}
              className={`rounded-md px-3 py-1 transition-all ${
                rightTab === 'chat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Copilot Chat
            </button>
            <button
              onClick={() => setRightTab('observability')}
              className={`rounded-md px-3 py-1 transition-all ${
                rightTab === 'observability' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Telemetry
            </button>
          </div>
        </div>

        {rightTab === 'chat' ? (
          <div className="flex flex-1 flex-col min-h-0 bg-background">
            {/* Conversation Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatHistory.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted-foreground">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                    <Sparkles className="size-5" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">PIM Copilot Console</h4>
                  <p className="text-xs leading-normal mt-1 max-w-[240px]">
                    Ask about structural design, blast radius, components, or circular dependencies.
                  </p>
                </div>
              )}

              {chatHistory.map((msg) => (
                <div key={msg.id} className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-normal shadow-sm border ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/40 text-foreground border'
                    }`}
                  >
                    <Markdown content={msg.content} />
                  </div>

                  {/* Grounded Evidence citation inside chat bubble */}
                  {msg.evidence && msg.evidence.length > 0 && (
                    <div className="w-[85%] border rounded-lg p-2.5 bg-muted/20 text-[10px] space-y-1.5 font-mono">
                      <span className="font-bold text-muted-foreground text-[8px] uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="size-3 text-emerald-500" />
                        Grounded Source Evidence ({msg.evidence.length}):
                      </span>
                      {msg.evidence.slice(0, 3).map((ev, idx) => (
                        <div key={idx} className="flex items-center justify-between text-muted-foreground truncate border-t pt-1.5 mt-1.5">
                          <span className="truncate">{ev.source} {ev.location && `L${ev.location}`}</span>
                          <span className="shrink-0">Conf: {(ev.confidence * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* In-progress stage timeline animation */}
              {isGeneratingResponse && activeTimeline.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-4 animate-pulse">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Cpu className="size-3.5 animate-spin text-primary" />
                    Executing PIM Exploration Pipeline...
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {activeTimeline.map((step) => (
                      <div key={step.stage} className="flex items-center gap-1.5 text-[10px] font-mono">
                        <div
                          className={`size-2 rounded-full ${
                            step.status === 'done'
                              ? 'bg-emerald-500'
                              : step.status === 'active'
                              ? 'bg-primary animate-ping'
                              : 'bg-muted-foreground/30'
                          }`}
                        />
                        <span
                          className={
                            step.status === 'done'
                              ? 'text-zinc-600 dark:text-zinc-400 line-through'
                              : step.status === 'active'
                              ? 'text-foreground font-bold'
                              : 'text-muted-foreground'
                          }
                        >
                          {step.stage}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input form */}
            <form onSubmit={handleSendMessage} className="border-t p-3 bg-muted/5 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about project dependencies..."
                disabled={isGeneratingResponse}
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground/60"
              />
              <button
                type="submit"
                disabled={isGeneratingResponse || !chatInput.trim()}
                className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow transition-all hover:bg-primary/95 disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        ) : (
          // Telemetry and Index
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <h4 className="font-semibold text-sm">Observability & Performance</h4>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border bg-background p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase font-semibold">
                  <span>Avg Latency</span>
                  <Clock className="size-3.5" />
                </div>
                <span className="font-bold text-lg mt-2 font-mono">{store.sessionMetrics.avgLatency}ms</span>
              </div>
              <div className="rounded-xl border bg-background p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase font-semibold">
                  <span>Total Tokens</span>
                  <Zap className="size-3.5" />
                </div>
                <span className="font-bold text-lg mt-2 font-mono">{store.sessionMetrics.totalTokens}</span>
              </div>
              <div className="rounded-xl border bg-background p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase font-semibold">
                  <span>Cache Hit Rate</span>
                  <Key className="size-3.5" />
                </div>
                <span className="font-bold text-lg mt-2 font-mono">{store.sessionMetrics.cacheHitRate}%</span>
              </div>
              <div className="rounded-xl border bg-background p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase font-semibold">
                  <span>PIM Index Size</span>
                  <Layers className="size-3.5" />
                </div>
                <span className="font-bold text-lg mt-2 font-mono">
                  {store.pim ? store.pim.entities().length + store.pim.relations().length : 0} nodes
                </span>
              </div>
            </div>

            {/* Evidence Index search */}
            <div className="space-y-3 pt-3 border-t">
              <h5 className="font-bold text-xs">Search Grounded Evidence Index</h5>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter codebase declarations..."
                  className="w-full rounded-lg border bg-background pl-8 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  onChange={(e) => {
                    // Filter code evidence from active PIM and render them below
                  }}
                />
              </div>

              {/* Show matching evidence declarations */}
              <div className="rounded-lg border bg-zinc-950 font-mono text-[9px] leading-relaxed text-zinc-400 p-3 h-52 overflow-y-auto space-y-2">
                {store.pim?.entities().flatMap(e => e.evidence).map((ev, idx) => (
                  <div key={idx} className="border-b border-zinc-800/60 pb-1.5">
                    <span className="text-primary font-bold">{ev.origin.toUpperCase()} Declaration:</span>
                    <div className="truncate text-zinc-300">{ev.source}</div>
                    <div className="flex justify-between text-zinc-500 mt-0.5">
                      <span>Method: {ev.method || 'AST Parse'}</span>
                      <span>Conf: {(ev.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default SoftwareIntelligenceWorkspace;
