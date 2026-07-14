import type { AIProvider, ProviderCapabilities } from '../core/AIProvider';
import { CancelledError } from '../core/AIError';
import type { ChatResponse, ResolvedRequest, StreamChunk } from '../core/types';
import { estimateMessagesTokens, estimateTokens } from '../core/tokens';
import { useProjectIntelligenceStore } from '@/features/ai/store/useProjectIntelligenceStore';
import { PimQuery } from './queries';
import type { PimEntity, Evidence } from './pim/ProjectIntelligenceModel';

const CAPS: ProviderCapabilities = {
  streaming: true,
  jsonMode: false,
  systemPrompt: true,
  maxContextTokens: 100_000,
};

export class MockProjectIntelligenceProvider implements AIProvider {
  readonly id = 'mock-project-intelligence';
  readonly capabilities = CAPS;
  private readonly chunkSize: number;

  constructor(options: { chunkSize?: number } = {}) {
    this.chunkSize = options.chunkSize ?? 64;
  }

  async complete(request: ResolvedRequest, signal?: AbortSignal): Promise<ChatResponse> {
    if (signal?.aborted) throw new CancelledError();

    const userMessage = request.messages.filter((m) => m.role === 'user').slice(-1)[0]?.content ?? '';
    const text = this.generateResponse(userMessage);

    return {
      text,
      finishReason: 'stop',
      model: request.model,
      provider: this.id,
      usage: {
        promptTokens: estimateMessagesTokens(request.messages),
        completionTokens: estimateTokens(text),
        totalTokens: estimateMessagesTokens(request.messages) + estimateTokens(text),
      },
    };
  }

  async *stream(request: ResolvedRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const response = await this.complete(request, signal);
    for (let i = 0; i < response.text.length; i += this.chunkSize) {
      if (signal?.aborted) throw new CancelledError();
      yield { delta: response.text.slice(i, i + this.chunkSize), done: false };
    }
    yield { delta: '', done: true, finishReason: 'stop', usage: response.usage };
  }

  private generateResponse(question: string): string {
    const store = useProjectIntelligenceStore.getState();
    const pim = store.pim;

    if (!pim) {
      return `### ⚠️ No Project Loaded
Please upload your project source files or load a pre-packaged sample repository in the **Software Ingestion Panel** to begin exploring with the Project Intelligence Copilot.`;
    }

    const query = new PimQuery(pim);
    const normalizedQuestion = question.toLowerCase();

    // 1. Health / Conflicts Query
    if (normalizedQuestion.includes('health') || normalizedQuestion.includes('conflict') || normalizedQuestion.includes('warning')) {
      const conflicts = pim.conflicts();
      const stats = pim.stats();
      const healthScore = Math.max(0, 100 - conflicts.length * 8);

      let response = `### 🛡️ Project Architecture Health Report\n\n`;
      response += `**Architecture Health Index:** \`${healthScore}/100\`\n`;
      response += `* **Total Entities:** ${stats.entities}\n`;
      response += `* **Total Relationships:** ${stats.relations}\n`;
      response += `* **Unresolved Conflicts/Warnings:** ${conflicts.length}\n\n`;

      if (conflicts.length === 0) {
        response += `✨ **Excellent!** No architectural anomalies, naming conflicts, or circular dependency loops detected in the fused Project Intelligence Model.`;
      } else {
        response += `#### Active Architectural Issues:\n\n`;
        conflicts.forEach((c, idx) => {
          response += `##### ${idx + 1}. [${c.severity.toUpperCase()}] ${c.title}\n`;
          response += `* **Category:** \`${c.kind}\`\n`;
          response += `* **Description:** ${c.description}\n`;
          response += `* **Impacted Entities:** ${c.entityIds.map(id => `\`${pim.getEntity(id)?.name || id}\``).join(', ')}\n\n`;
        });
      }
      return response;
    }

    // 2. Scan for specific entity in question
    const entities = pim.entities();
    let foundEntity: PimEntity | undefined;
    for (const e of entities) {
      const name = e.name.toLowerCase();
      if (normalizedQuestion.includes(name) || e.aliases.some(a => normalizedQuestion.includes(a.toLowerCase()))) {
        foundEntity = e;
        break;
      }
    }

    // 3. Entity Details/Dependencies Query
    if (foundEntity) {
      const isDependencyQuery = normalizedQuestion.includes('depend') || normalizedQuestion.includes('use') || normalizedQuestion.includes('call');
      const isImpactQuery = normalizedQuestion.includes('impact') || normalizedQuestion.includes('blast') || normalizedQuestion.includes('change');

      if (isDependencyQuery) {
        const deps = query.findDependencies(foundEntity.id);
        const dependents = query.findDependents(foundEntity.id);

        let response = `### 🔗 Dependency Map for \`${foundEntity.name}\` (${foundEntity.ontologyType})\n\n`;
        response += `#### Outgoing Dependencies (What \`${foundEntity.name}\` uses):\n`;
        if (deps.length === 0) {
          response += `* No outgoing dependencies detected.\n`;
        } else {
          deps.forEach(d => {
            response += `* **\`${d.name}\`** (\`${d.ontologyType}\`) — ${d.description || 'No description available.'}\n`;
          });
        }

        response += `\n#### Incoming Dependents (What relies on \`${foundEntity.name}\`):\n`;
        if (dependents.length === 0) {
          response += `* No incoming dependents detected.\n`;
        } else {
          dependents.forEach(d => {
            response += `* **\`${d.name}\`** (\`${d.ontologyType}\`) — ${d.description || 'No description available.'}\n`;
          });
        }

        response += `\n${this.renderEvidence(foundEntity.evidence)}`;
        return response;
      }

      if (isImpactQuery) {
        const impact = query.downstreamImpact(foundEntity.id);

        let response = `### 💥 Downstream Blast Radius: \`${foundEntity.name}\`\n\n`;
        response += `If you modify or break the interface of \`${foundEntity.name}\`, the following **${impact.length}** downstream components could be affected:\n\n`;

        if (impact.length === 0) {
          response += `✨ **Zero Downstream Impact:** This component is a leaf node; no other components depend on it directly or transitively.\n`;
        } else {
          impact.forEach((d, idx) => {
            response += `${idx + 1}. **\`${d.name}\`** (\`${d.ontologyType}\`)\n`;
            response += `   * *Kind:* ${d.kind}\n`;
            response += `   * *Confidence:* ${(d.confidence * 100).toFixed(0)}%\n`;
            if (d.description) response += `   * *Role:* ${d.description}\n`;
          });
        }

        response += `\n${this.renderEvidence(foundEntity.evidence)}`;
        return response;
      }

      // Default Entity Information
      let response = `### 🔍 Entity Analysis: \`${foundEntity.name}\`\n\n`;
      response += `* **Ontology Concept:** \`${foundEntity.ontologyType}\` (Kind: \`${foundEntity.kind}\`)\n`;
      response += `* **Category:** \`${foundEntity.category}\`\n`;
      response += `* **Confidence Index:** \`${(foundEntity.confidence * 100).toFixed(0)}%\`\n`;
      if (foundEntity.description) {
        response += `* **Description:** ${foundEntity.description}\n`;
      }

      if (foundEntity.aliases.length > 0) {
        response += `* **Aliases:** ${foundEntity.aliases.map(a => `\`${a}\``).join(', ')}\n`;
      }

      if (Object.keys(foundEntity.attributes).length > 0) {
        response += `\n#### Attributes:\n`;
        Object.entries(foundEntity.attributes).forEach(([k, v]) => {
          response += `* **${k}:** \`${v}\`\n`;
        });
      }

      const deps = query.findDependencies(foundEntity.id);
      if (deps.length > 0) {
        response += `\n#### Key Collaborations:\n`;
        deps.slice(0, 3).forEach(d => {
          response += `* Relies on **\`${d.name}\`** (\`${d.ontologyType}\`)\n`;
        });
      }

      response += `\n${this.renderEvidence(foundEntity.evidence)}`;
      return response;
    }

    // 4. Scan for ontology type
    const ontologyKeywords = {
      service: 'Service',
      api: 'API',
      endpoint: 'Endpoint',
      database: 'Database',
      db: 'Database',
      table: 'DatabaseTable',
      infrastructure: 'Infrastructure',
      requirement: 'Requirement',
      documentation: 'Documentation',
      workflow: 'Workflow',
    };

    let targetOntologyType: string | undefined;
    for (const [kw, ot] of Object.entries(ontologyKeywords)) {
      if (normalizedQuestion.includes(kw)) {
        targetOntologyType = ot;
        break;
      }
    }

    if (targetOntologyType) {
      const matches = entities.filter(
        (e) => e.ontologyType === targetOntologyType || e.kind === targetOntologyType.toLowerCase()
      );

      let response = `### 🏷️ Ontology concept lookup: \`${targetOntologyType}\`\n\n`;
      response += `Found **${matches.length}** entities mapped to this concept category in the fused PIM:\n\n`;

      if (matches.length === 0) {
        response += `No matching entities found. Ensure that your files contain entities mapping to this ontology concept.\n`;
      } else {
        matches.forEach((m) => {
          response += `* **\`${m.name}\`** (\`${m.kind}\`)\n`;
          if (m.description) response += `  * *Description:* ${m.description}\n`;
        });
      }
      return response;
    }

    // 5. Default Fallback response using project stats
    const stats = pim.stats();
    let response = `### 🤖 Project Intelligence Copilot\n\n`;
    response += `I can help you explore the parsed digital twin model of this repository. Here are some things you can ask me:\n\n`;
    response += `* "Explain \`ServiceName\`" to see its attributes and source code evidence.\n`;
    response += `* "What are the dependencies of \`ServiceName\`?" or "What depends on \`DatabaseName\`?"\n`;
    response += `* "What is the downstream impact of changing \`ServiceName\`?" (Blast radius analysis)\n`;
    response += `* "Show me the project architecture health / conflicts"\n`;
    response += `* "List all APIs / databases / services"\n\n`;

    response += `#### 📊 Current Digital Twin Model Status:\n`;
    response += `* **Fitted Files:** ${store.importLogs.filter(l => l.includes('Extracted AST')).length} files\n`;
    response += `* **Fused Entities:** ${stats.entities}\n`;
    response += `* **Resolved Relationships:** ${stats.relations}\n`;
    response += `* **Detected Technologies:** ${Array.from(new Set(entities.map(e => e.attributes.language || e.attributes.technology).filter(Boolean))).join(', ') || 'N/A'}\n`;

    return response;
  }

  private renderEvidence(evidences: readonly Evidence[]): string {
    if (!evidences || evidences.length === 0) return '';
    let response = `#### 📁 Grounded Evidence (${evidences.length} source citations):\n\n`;
    evidences.slice(0, 5).forEach((ev) => {
      response += `> **[Evidence Citation]**\n`;
      response += `> * **Source File:** \`${ev.source || 'Unknown'}\`\n`;
      response += `> * **Origin:** \`${ev.origin}\`\n`;
      if (ev.location) response += `> * **Line Range:** \`L${ev.location}\`\n`;
      response += `> * **Confidence:** \`${(ev.confidence * 100).toFixed(0)}%\`\n`;
      response += `> * **Extraction Method:** \`${ev.method || 'AST Parse'}\`\n\n`;
    });
    return response;
  }
}
