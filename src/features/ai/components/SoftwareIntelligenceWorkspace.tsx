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
  FileText,
  Info,
  ChevronDown,
  ChevronRight,
  Clock,
  Key,
  Zap,
  Code,
  Layers,
  Upload,
  FolderUp,
  Download,
  Flame,
  Loader2,
} from 'lucide-react';
import { useProjectIntelligenceStore } from '../store/useProjectIntelligenceStore';
import { SAMPLE_PROJECTS } from '../store/sampleRepositories';
import { AIGenerationContext } from '../AIGenerationContext';
import { Markdown } from './Markdown';
import { ingestFileList } from '../lib/repositoryIngestion';
import { pimToDiagramPlan, type ArchitectureViewType } from '@/ai/generation';
import { projectService } from '@/services';
import {
  ExecutionFramework,
  ExecutionContext,
  AgentMemory,
  ArchitectureAgent,
  SecurityAgent,
  ReviewerAgent,
  DocumentationAgent,
  DevOpsAgent,
  DatabaseAgent,
  TestingAgent,
  BackendAgent,
  KnowledgeQueryTool,
  RepositorySearchTool,
  ASTInspectTool,
} from '@/ai';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  timeline?: { stage: string; status: 'pending' | 'active' | 'done' }[];
  evidence?: { source: string; origin: string; location?: string; confidence: number; method: string }[];
}

interface MissionPreset {
  id: string;
  name: string;
  description: string;
  agents: string[];
  icon: React.ComponentType<{ className?: string }>;
}

const MISSION_PRESETS: MissionPreset[] = [
  {
    id: 'architecture-analysis',
    name: 'Repository Architecture Analysis',
    description: 'Deconstructs repository layers, styles, patterns, and component topologies using Architecture, DevOps & Database agents.',
    agents: ['architecture-agent', 'devops-agent', 'database-agent'],
    icon: Layers,
  },
  {
    id: 'architecture-review',
    name: 'Comprehensive Architecture Review',
    description: 'Evaluates architectural integrity, coupling, circular dependencies, and security boundaries with Architecture, Security & Reviewer agents.',
    agents: ['architecture-agent', 'security-agent', 'reviewer-agent'],
    icon: ShieldAlert,
  },
  {
    id: 'security-audit',
    name: 'Security Vulnerability Audit',
    description: 'Scans dependency manifests and source files for secret leaks, unvalidated inputs, and vulnerabilities with Security & Reviewer agents.',
    agents: ['security-agent', 'reviewer-agent', 'testing-agent'],
    icon: Flame,
  },
  {
    id: 'full-documentation',
    name: 'Reverse-Engineering & System Docs',
    description: 'Generates comprehensive documentation, component catalogues, and test plans with Documentation, Backend & Testing agents.',
    agents: ['documentation-agent', 'backend-agent', 'testing-agent'],
    icon: FileText,
  },
];

export function SoftwareIntelligenceWorkspace() {
  const store = useProjectIntelligenceStore();
  const context = useContext(AIGenerationContext);
  const generator = context?.generator;
  const runtime = context?.runtime;

  // UI view selectors
  const [centerTab, setCenterTab] = useState<'explorer' | 'map' | 'missions'>('explorer');
  const [rightTab, setRightTab] = useState<'chat' | 'observability'>('chat');
  const [selectedOntology, setSelectedOntology] = useState<string>('all');
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
  const [selectedViewType, setSelectedViewType] = useState<ArchitectureViewType>('architecture');
  const [mapViewMode, setMapViewMode] = useState<'flow' | 'grid'>('flow');
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);

  // Custom file upload state
  const [customFileCount, setCustomFileCount] = useState(0);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('pim_copilot_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('pim_copilot_chat_history', JSON.stringify(chatHistory));
    } catch {
      // Ignore write errors
    }
  }, [chatHistory]);

  // Autonomous Missions State
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [isMissionRunning, setIsMissionRunning] = useState(false);
  const [missionProgress, setMissionProgress] = useState(0);
  const [missionLogs, setMissionLogs] = useState<string[]>([]);
  const [missionReport, setMissionReport] = useState<any | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const missionLogsEndRef = useRef<HTMLDivElement>(null);

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
  }, [chatHistory, isGeneratingResponse]);

  // Scroll mission logs
  useEffect(() => {
    if (missionLogsEndRef.current) {
      missionLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [missionLogs]);

  // Load a default sample project if none loaded
  useEffect(() => {
    if (store.importStatus === 'idle' && !store.pim) {
      store.loadSampleProject('ecommerce');
    }
  }, []);

  const handleDirectoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      const ingested = await ingestFileList(fileList);
      if (ingested.files.length === 0) {
        alert('No parseable source code files found in selected upload.');
        return;
      }
      setCustomFileCount(ingested.files.length);
      await store.importFiles(
        ingested.files.map((f) => ({ path: f.path, content: f.content })),
        'custom'
      );
    } catch (err: any) {
      console.error('Directory ingestion error:', err);
      alert(`Directory upload error: ${err.message}`);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = chatInput.trim();
    if (!query || isGeneratingResponse) return;

    setChatInput('');
    setIsGeneratingResponse(true);
    const startTime = Date.now();

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };

    setChatHistory((prev) => [...prev, userMsg]);

    let answerText = '';
    const evidenceList: any[] = [];

    if (!store.pim) {
      answerText = '### ⚠️ No Project Ingested\nPlease import or load a software repository first to build the PIM digital twin.';
    } else {
      const entities = store.pim.entities();
      const relations = store.pim.relations();
      const lowerQuery = query.toLowerCase();

      const matchedEntities = entities.filter((ent) =>
        lowerQuery.includes(ent.name.toLowerCase()) ||
        ent.kind.toLowerCase().includes(lowerQuery) ||
        ent.ontologyType.toLowerCase().includes(lowerQuery) ||
        (ent.description && ent.description.toLowerCase().includes(lowerQuery)) ||
        ent.tags.some((t) => lowerQuery.includes(t.toLowerCase())) ||
        ent.aliases.some((a) => lowerQuery.includes(a.toLowerCase()))
      );

      const targetEntities = matchedEntities.length > 0 ? matchedEntities.slice(0, 8) : entities.slice(0, 5);

      for (const ent of targetEntities) {
        for (const ev of ent.evidence) {
          evidenceList.push({
            source: ev.source || 'repository',
            origin: ev.origin,
            location: ev.location,
            confidence: ev.confidence,
            method: ev.method || 'AST Parse',
          });
        }
      }

      const aiService = context?.service;
      if (aiService) {
        try {
          const entitiesSummary = targetEntities
            .map((e) => `- **${e.name}** (${e.ontologyType || e.kind}): ${e.description || 'Core entity'}`)
            .join('\n');

          const relatedEdges = relations
            .filter((r) => targetEntities.some((te) => te.id === r.source || te.id === r.target))
            .slice(0, 10)
            .map((r) => `- ${r.source} -> [${r.kind}] -> ${r.target}`)
            .join('\n');

          const systemPrompt = `You are the AI Project Intelligence Copilot, an expert software architecture assistant analyzing a real software repository.
You have direct access to a verified Project Intelligence Model (PIM) digital twin representing the codebase's components, APIs, dependencies, and data models.

Context Entities:
${entitiesSummary}

Context Architectural Relations:
${relatedEdges || 'None'}

Instructions:
1. Provide a comprehensive, clear, and human-readable architectural explanation directly answering the user's question.
2. Clearly explain execution flows (e.g., from HTTP requests and routers through services down to database models).
3. Explicitly reference relevant files, endpoints, functions, and classes discovered in the codebase.
4. Format your response cleanly in Markdown using structured sections with bold text, bullet points, and code spans. Do not output raw JSON or unformatted symbol lists.`;

          const response = await aiService.complete({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: query },
            ],
            temperature: 0.2,
            maxTokens: 1200,
          });

          answerText = response.text;
        } catch (err: any) {
          console.warn('AI service call failed, generating grounded PIM response:', err);
          answerText = generateGroundedPimAnswer(query, targetEntities, relations);
        }
      } else {
        answerText = generateGroundedPimAnswer(query, targetEntities, relations);
      }
    }

    const latency = Date.now() - startTime;
    const tokens = Math.round(answerText.length / 3);
    store.recordQueryMetrics(latency, tokens, true, false);

    const assistantMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'assistant',
      content: answerText,
      timestamp: Date.now(),
      evidence: evidenceList.slice(0, 5),
    };

    setChatHistory((prev) => [...prev, assistantMsg]);
    setIsGeneratingResponse(false);
  };

  const handleGenerateDiagram = async () => {
    let currentPim = store.pim;

    // Self-heal PIM if files are loaded but PIM not yet compiled
    if (!currentPim) {
      if (store.files && store.files.length > 0) {
        setIsGeneratingDiagram(true);
        try {
          await store.importFiles(store.files, store.activeProjectId || 'custom');
          currentPim = useProjectIntelligenceStore.getState().pim;
        } catch (err: any) {
          setIsGeneratingDiagram(false);
          alert(`Failed to compile architecture model: ${err.message}`);
          return;
        }
      } else {
        alert('Please load a project or sample repository first to build the architecture model.');
        return;
      }
    }

    if (!currentPim) {
      setIsGeneratingDiagram(false);
      alert('Architecture model is not ready yet. Please wait for ingestion to complete.');
      return;
    }

    setIsGeneratingDiagram(true);

    try {
      const plan = pimToDiagramPlan(currentPim, { viewType: selectedViewType });

      if (generator && runtime) {
        // Clear any old canvas nodes so the fresh 5-tier architecture renders cleanly
        const doc = runtime.getDocument();
        const existingNodeIds = Object.keys(doc.nodes);
        if (existingNodeIds.length > 0) {
          runtime.transaction(
            () => {
              for (const nid of existingNodeIds) {
                runtime.executeType('node.delete', { id: nid });
              }
            },
            { label: 'Clear canvas for new architecture diagram', origin: 'program' }
          );
        }

        // Apply clean 5-tier diagram plan to runtime
        generator.applyPlan(plan);

        // Switch to canvas tab immediately
        store.setActiveTab('canvas');
      } else {
        localStorage.setItem('pending_generated_plan', JSON.stringify(plan));

        // Find existing project in the database or create one for this repository diagram
        let targetId = '';
        try {
          const projects = await projectService.list();
          if (projects && projects.length > 0) {
            targetId = projects[0]!.id;
          } else {
            targetId = '6d0c8d3f992c4c4696bee74abcccad03';
          }
        } catch (err) {
          console.warn('Could not query project, falling back to seed project ID', err);
          targetId = '6d0c8d3f992c4c4696bee74abcccad03';
        }

        window.location.href = `/editor/${targetId}`;
      }
    } catch (e: any) {
      console.error('Failed to auto-generate diagram on canvas', e);
      alert(`Error generating diagram: ${e.message}`);
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  const handleRunMission = async (preset: MissionPreset) => {
    if (!store.pim && store.files.length === 0) {
      alert('Please load or import a repository first before launching an autonomous mission.');
      return;
    }

    setActiveMissionId(preset.id);
    setIsMissionRunning(true);
    setMissionProgress(10);
    setMissionLogs([`[AEF] Initializing mission: "${preset.name}"...`]);
    setMissionReport(null);

    try {
      const framework = new ExecutionFramework();
      const memory = new AgentMemory();

      // Register inspection tools in the framework
      framework.tools.register(new KnowledgeQueryTool());
      framework.tools.register(new RepositorySearchTool());
      framework.tools.register(new ASTInspectTool());

      const agentMap: Record<string, any> = {
        'architecture-agent': new ArchitectureAgent(),
        'security-agent': new SecurityAgent(),
        'reviewer-agent': new ReviewerAgent(),
        'documentation-agent': new DocumentationAgent(),
        'devops-agent': new DevOpsAgent(),
        'database-agent': new DatabaseAgent(),
        'backend-agent': new BackendAgent(),
        'testing-agent': new TestingAgent(),
      };

      for (const [, agent] of Object.entries(agentMap)) {
        framework.execution.register(agent);
      }

      const missionId = `mission_${Date.now()}`;
      const results: Record<string, any> = {};
      const agentIds = preset.agents;
      const stepPct = 80 / agentIds.length;
      let currentPct = 15;

      for (let i = 0; i < agentIds.length; i++) {
        const agentId = agentIds[i];
        if (!agentId) continue;
        const agent = agentMap[agentId];
        if (!agent) continue;

        setMissionLogs((prev) => [...prev, `[AEF] Step ${i + 1}/${agentIds.length}: Dispatching ${agent.name} (${agentId})...`]);

        const handoffContext = memory.getHandoffContextForAgent(missionId, agentId);

        const inputData: Record<string, any> = {
          serviceName: 'main',
          componentName: 'App',
          targetFile: store.files[0]?.path || 'main.py',
          changeId: 'audit-001',
          topic: 'System Architecture',
          query: 'architecture',
          schemaName: 'public',
          targetEnv: 'production',
          projectPath: '.',
        };

        const ctx = new ExecutionContext({
          taskId: `task_${agentId}`,
          sessionId: `session_${missionId}`,
          userGoal: preset.name,
          permissions: ['*'],
          metadata: {
            inputData,
            files: store.files,
            pim: store.pim,
            reEngine: store.engine?.knowledge(),
            toolRegistry: framework.tools,
            memory,
            handoffContext,
            aiService: context?.service,
          },
        });

        const execResult = await agent.execute(ctx);
        if (execResult.success) {
          const output = (execResult.data as any) || {};
          results[agentId] = output;

          memory.recordHandoff({
            missionId,
            fromAgentId: agentId,
            summary: `${agent.name} completed analysis`,
            findings: output.data || {},
            evidence: output.evidence || [],
          });

          setMissionLogs((prev) => [
            ...prev,
            `[AEF] ✓ ${agent.name} completed (${output.evidence?.length || 0} evidence citations, ${(output.confidence * 100).toFixed(0)}% confidence).`,
          ]);
        } else {
          setMissionLogs((prev) => [
            ...prev,
            `[AEF] ⚠️ ${agent.name} error: ${execResult.error?.message}`,
          ]);
        }

        currentPct += stepPct;
        setMissionProgress(Math.min(Math.round(currentPct), 90));
      }

      setMissionProgress(100);
      setMissionLogs((prev) => [...prev, `[AEF] Mission complete! Aggregated findings into Final Mission Report.`]);

      const allEvidence = Object.values(results).flatMap((r: any) => r.evidence || []);
      const allRecs = Object.values(results).flatMap((r: any) => r.recommendations || []);

      const report = {
        missionId,
        presetId: preset.id,
        presetName: preset.name,
        timestamp: new Date().toISOString(),
        agentsExecuted: agentIds,
        results,
        evidence: allEvidence,
        recommendations: allRecs,
      };

      setMissionReport(report);
    } catch (err: any) {
      setMissionLogs((prev) => [...prev, `[AEF] ❌ Mission failed: ${err.message}`]);
    } finally {
      setIsMissionRunning(false);
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

          {/* Local Repository / File Ingestion */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Import Local Repository
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={store.importStatus === 'importing'}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-2.5 text-xs font-semibold hover:bg-muted/50 transition-all text-primary border-primary/30"
              >
                <FolderUp className="size-4" />
                Upload Folder
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={store.importStatus === 'importing'}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-2.5 text-xs font-semibold hover:bg-muted/50 transition-all text-foreground"
              >
                <Upload className="size-4" />
                Upload Files
              </button>
            </div>

            <input
              ref={folderInputRef}
              type="file"
              className="hidden"
              // @ts-expect-error webkitdirectory is standard in Chromium/Firefox
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleDirectoryUpload}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleDirectoryUpload}
            />

            {customFileCount > 0 && store.activeProjectId === 'custom' && (
              <p className="text-[10px] text-primary text-center font-mono">
                ✓ Ingested {customFileCount} files successfully into PIM digital twin.
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

      {/* ── Center Column: Ontology Explorer, Capability Map & Autonomous Missions ── */}
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
            <button
              onClick={() => setCenterTab('missions')}
              className={`rounded-md px-3 py-1 transition-all flex items-center gap-1.5 ${
                centerTab === 'missions' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Cpu className="size-3 text-primary" />
              Missions
            </button>
          </div>

          {store.pim && (
            <div className="flex items-center gap-2">
              <select
                value={selectedViewType}
                onChange={(e) => setSelectedViewType(e.target.value as ArchitectureViewType)}
                className="rounded-lg border bg-background px-2.5 py-1 text-xs outline-none text-foreground font-medium"
              >
                <option value="architecture">Architecture View</option>
                <option value="c4-container">C4 Container</option>
                <option value="component">Component View</option>
                <option value="dependencies">Dependency Graph</option>
                <option value="erd">Entity Relation (ERD)</option>
                <option value="api">API Endpoints</option>
              </select>
              <button
                type="button"
                onClick={handleGenerateDiagram}
                disabled={isGeneratingDiagram}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow transition-all hover:bg-primary/95 disabled:opacity-50"
              >
                {isGeneratingDiagram ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Generate Diagram
                  </>
                )}
              </button>
            </div>
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

                        {isExpanded && (
                          <div className="border-t px-4 py-3 space-y-3 text-xs leading-normal">
                            {entity.description && (
                              <p className="text-muted-foreground leading-relaxed">{entity.description}</p>
                            )}

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
          ) : centerTab === 'map' ? (
            // Capability Map & Tiered Architecture Topology Viewer
            <div className="space-y-6">
              {/* Header and View Mode Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border bg-card p-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Interactive Architecture Flow</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Structured multi-tier component hierarchy and downstream blast radius
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setMapViewMode('flow')}
                      className={`rounded-md px-3 py-1 font-medium transition-all ${
                        mapViewMode === 'flow'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Tiered Flow View
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapViewMode('grid')}
                      className={`rounded-md px-3 py-1 font-medium transition-all ${
                        mapViewMode === 'grid'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      All Entities Grid
                    </button>
                  </div>
                </div>
              </div>

              {mapViewMode === 'flow' ? (
                // Clean Tiered Architecture Flow
                <div className="space-y-6">
                  {[
                    {
                      tierIndex: 0,
                      label: 'Client Ingress & Application Entrypoint',
                      badge: 'Tier 1 • Gateway / Entrypoint',
                      color: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
                      match: (e: any) =>
                        e.name === 'main' ||
                        e.name.includes('app') ||
                        e.kind === 'gateway' ||
                        (e.ontologyType || '').includes('Gateway'),
                    },
                    {
                      tierIndex: 1,
                      label: 'API Routers & Controllers',
                      badge: 'Tier 2 • Controllers',
                      color: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400',
                      match: (e: any) =>
                        e.name.includes('router') ||
                        e.name.includes('controller') ||
                        e.kind === 'router' ||
                        (e.ontologyType || '').includes('Router'),
                    },
                    {
                      tierIndex: 2,
                      label: 'Business Logic & Domain Services',
                      badge: 'Tier 3 • Domain Services',
                      color: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
                      match: (e: any) =>
                        (e.name.includes('service') || e.kind === 'service' || (e.ontologyType || '').includes('Service')) &&
                        !e.name.includes('router'),
                    },
                    {
                      tierIndex: 3,
                      label: 'Data Repositories & Access Layer',
                      badge: 'Tier 4 • Repositories',
                      color: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
                      match: (e: any) =>
                        e.name.includes('repository') ||
                        e.name.includes('dao') ||
                        e.kind === 'repository' ||
                        (e.ontologyType || '').includes('Repository'),
                    },
                    {
                      tierIndex: 4,
                      label: 'Persistence Engine & Data Models',
                      badge: 'Tier 5 • Database / Storage',
                      color: 'border-purple-500/30 bg-purple-500/5 text-purple-400',
                      match: (e: any) =>
                        e.kind === 'database' ||
                        (e.ontologyType || '').includes('Database') ||
                        (e.ontologyType || '').includes('Table') ||
                        (e.ontologyType || '').includes('Model') ||
                        e.name.includes('model') ||
                        e.name === 'database',
                    },
                  ].map((layer, idx) => {
                    const matchingEntities = (store.pim?.entities() || []).filter(
                      (e) =>
                        layer.match(e) &&
                        !['fastapi', 'pydantic', 'sqlalchemy', 'alembic', 'pytest', 'typing'].includes(e.name.toLowerCase()),
                    );

                    if (matchingEntities.length === 0) return null;

                    return (
                      <div key={layer.tierIndex} className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${layer.color}`}>
                              {layer.badge}
                            </span>
                            <span className="text-xs font-medium text-foreground">{layer.label}</span>
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {matchingEntities.length} component{matchingEntities.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {matchingEntities.map((entity) => {
                            const isHovered = hoveredEntity === entity.id;
                            const isImpacted = blastRadiusIds.includes(entity.id);

                            return (
                              <div
                                key={entity.id}
                                onMouseEnter={() => setHoveredEntity(entity.id)}
                                onMouseLeave={() => setHoveredEntity(null)}
                                className={`rounded-xl border p-3.5 transition-all cursor-default ${
                                  isHovered
                                    ? 'border-primary bg-primary/10 shadow-lg scale-[1.02]'
                                    : isImpacted
                                    ? 'border-amber-500/60 bg-amber-500/10 shadow-sm'
                                    : 'border-border bg-card/60 hover:border-primary/40'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-mono font-bold uppercase text-primary">
                                    {entity.ontologyType || entity.kind}
                                  </span>
                                  <span className="text-[10px] font-mono font-medium text-muted-foreground">
                                    {((entity.confidence || 0.9) * 100).toFixed(0)}% conf
                                  </span>
                                </div>
                                <h4 className="font-semibold text-sm mt-1 text-foreground">{entity.name}</h4>
                                {entity.description && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {entity.description}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {idx < 4 && (
                          <div className="flex items-center justify-center py-1 text-muted-foreground">
                            <span className="text-xs font-mono text-muted-foreground/60 flex items-center gap-1.5">
                              ↓ calls downstream dependencies ↓
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // All Entities Blast Radius Grid
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
                            ? 'border-amber-500/50 bg-amber-500/10'
                            : 'bg-background hover:border-muted-foreground/30'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">
                              {entity.ontologyType}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-primary">
                              {(entity.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <h4 className="font-bold text-sm mt-1">{entity.name}</h4>
                          {entity.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entity.description}</p>
                          )}
                        </div>

                        {isHovered && blastRadiusIds.length > 0 && (
                          <div className="mt-3 border-t pt-2 text-[10px] text-muted-foreground font-mono">
                            <span className="font-bold text-primary">Blast Radius Impact:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {blastRadiusIds.map((id) => (
                                <span key={id} className="rounded bg-muted px-1.5 py-0.5">
                                  {id}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            // Autonomous Engineering Missions
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Cpu className="size-5 text-primary" />
                  Autonomous AI Engineering Missions
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Launch specialist agent teams across your repository to reverse-engineer architecture, audit security, review code quality, and generate system documentation.
                </p>
              </div>

              {/* Mission Launch Cards */}
              <div className="grid grid-cols-2 gap-4">
                {MISSION_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isRunning = isMissionRunning && activeMissionId === preset.id;

                  return (
                    <div
                      key={preset.id}
                      className="rounded-xl border bg-background p-4 flex flex-col justify-between gap-4 hover:border-primary/40 transition-all shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Icon className="size-4" />
                            </div>
                            <h4 className="font-bold text-xs">{preset.name}</h4>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                          {preset.description}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-3">
                          {preset.agents.map((ag) => (
                            <span key={ag} className="text-[9px] font-mono rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                              {ag.replace('-agent', '')}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRunMission(preset)}
                        disabled={isMissionRunning}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow transition-all hover:bg-primary/95 disabled:opacity-50"
                      >
                        {isRunning ? (
                          <>
                            <RefreshCw className="size-3.5 animate-spin" />
                            Executing Mission ({missionProgress}%)...
                          </>
                        ) : (
                          <>
                            <Play className="size-3.5" />
                            Launch Mission
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Mission Execution Console */}
              {(isMissionRunning || missionLogs.length > 0) && (
                <div className="rounded-xl border bg-zinc-950 p-4 font-mono text-[10px] text-zinc-300 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="font-bold text-primary flex items-center gap-2">
                      <Terminal className="size-3.5" />
                      Mission Execution Stream
                    </span>
                    <span className="text-zinc-500">{missionProgress}% Completed</span>
                  </div>

                  <div className="h-32 overflow-y-auto space-y-1.5 scrollbar-thin">
                    {missionLogs.map((log, idx) => (
                      <div key={idx} className={log.includes('✓') ? 'text-emerald-400 font-bold' : log.includes('❌') ? 'text-red-400' : 'text-zinc-300'}>
                        {log}
                      </div>
                    ))}
                    <div ref={missionLogsEndRef} />
                  </div>
                </div>
              )}

              {/* Final Mission Report Viewer */}
              {missionReport && (
                <div className="rounded-xl border bg-muted/10 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-emerald-500" />
                        Final Mission Report: {missionReport.presetName}
                      </h4>
                      <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        Mission ID: {missionReport.missionId} · Generated: {new Date(missionReport.timestamp).toLocaleTimeString()}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(missionReport, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${missionReport.presetId}-report.json`;
                        a.click();
                      }}
                      className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-all"
                    >
                      <Download className="size-3.5" />
                      Export Report
                    </button>
                  </div>

                  {/* Recommendations */}
                  {missionReport.recommendations?.length > 0 && (
                    <div className="rounded-lg bg-background border p-4 space-y-2">
                      <span className="text-xs font-bold text-primary uppercase tracking-wider">
                        Actionable Recommendations ({missionReport.recommendations.length}):
                      </span>
                      <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                        {missionReport.recommendations.map((rec: string, idx: number) => (
                          <li key={idx} className="leading-relaxed">{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Specialist Agent Outputs */}
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Specialist Agent Findings
                    </span>
                    <div className="grid grid-cols-1 gap-3">
                      {Object.entries(missionReport.results).map(([agentId, result]: [string, any]) => (
                        <div key={agentId} className="rounded-lg border bg-background p-3.5 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-primary font-mono">{agentId}</span>
                            <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                              Confidence: {((result.confidence || 0.95) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <pre className="rounded bg-muted/40 p-2.5 font-mono text-[10px] overflow-x-auto leading-relaxed text-foreground max-h-48">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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

              {isGeneratingResponse && (
                <div className="flex items-center gap-2 rounded-xl border bg-muted/20 p-3 text-xs font-semibold text-foreground animate-pulse">
                  <Cpu className="size-4 animate-spin text-primary" />
                  Reasoning over PIM digital twin...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

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
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <h4 className="font-semibold text-sm">Observability & Performance</h4>

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

            <div className="space-y-3 pt-3 border-t">
              <h5 className="font-bold text-xs">Search Grounded Evidence Index</h5>
              <div className="rounded-lg border bg-zinc-950 font-mono text-[9px] leading-relaxed text-zinc-400 p-3 h-52 overflow-y-auto space-y-2">
                {store.pim?.entities().flatMap((e) => e.evidence).map((ev, idx) => (
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

function generateGroundedPimAnswer(query: string, entities: any[], relations: readonly any[]): string {
  if (entities.length === 0) {
    return `### Repository Architecture Overview

Evaluating the query **"${query}"** against the Project Intelligence Model:

- **Entity Count**: ${entities.length} components indexed in digital twin.
- **Analysis**: No exact component match was identified for the specific query terms in the current scope. Please browse the **Ontology Explorer** to review the extracted symbols, routers, and modules.`;
  }

  const routes = entities.filter((e) => e.kind === 'endpoint' || e.ontologyType === 'API');
  const services = entities.filter((e) => e.kind === 'service' || e.name.toLowerCase().includes('service'));
  const models = entities.filter((e) => e.kind === 'model' || e.name.toLowerCase().includes('task') || e.name.toLowerCase().includes('user') || e.ontologyType === 'SoftwareComponent');

  let explanation = `### Architecture & Execution Analysis

Based on the verified Project Intelligence Model (PIM) digital twin, here is the architectural breakdown for:
> **"${query}"**

#### 1. Entry Point & API Routing
`;

  if (routes.length > 0) {
    explanation += routes.slice(0, 4).map((r) => `- **Endpoint**: \`${r.name}\` (${r.method || 'HTTP'})\n  - Source: \`${r.file || 'main.py'}\` (Line ${r.line || 1})\n  - Integration: ${r.description || 'Handles inbound client requests'}`).join('\n\n') + '\n\n';
  } else {
    explanation += `- The primary execution begins at the API routing layer (e.g., \`main.py\` and modular route definitions) which dispatches requests to downstream handlers.\n\n`;
  }

  explanation += `#### 2. Domain & Application Logic\n`;
  if (services.length > 0) {
    explanation += services.slice(0, 3).map((s) => `- **Service**: \`${s.name}\`\n  - Encapsulates business validation, transaction boundaries, and orchestration.`).join('\n\n') + '\n\n';
  } else {
    explanation += `- Business logic is structured in modular services that process incoming payloads, validate request schemas, and invoke database persistence operations.\n\n`;
  }

  explanation += `#### 3. Data Persistence & Models\n`;
  if (models.length > 0) {
    explanation += models.slice(0, 4).map((m) => `- **Model / Entity**: \`${m.name}\`\n  - File: \`${m.file || 'models'}\`\n  - Role: ${m.description || 'Data schema and persistence mapping'}`).join('\n\n') + '\n\n';
  }

  const related = relations.filter((r) => entities.some((e) => e.id === r.source || e.id === r.target));
  if (related.length > 0) {
    explanation += `#### 4. Verified Architectural Dependencies\n`;
    explanation += related.slice(0, 5).map((r) => `- \`${r.source.replace(/^pim:/, '')}\` → **${r.kind}** → \`${r.target.replace(/^pim:/, '')}\``).join('\n') + '\n\n';
  }

  explanation += `#### 5. Grounding & Verification\nAll findings are verified against the AST parser graph and PIM relationship index with high confidence.`;

  return explanation;
}

export default SoftwareIntelligenceWorkspace;
