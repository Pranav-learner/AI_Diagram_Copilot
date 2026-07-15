import type { Mission, Objective } from './Mission';
import type { SharedPlanningModel, SpmTask } from '../execution-graph/SharedPlanningModel';
import type { ExecutionGraph } from '../execution-graph/ExecutionGraph';
import { ExecutionCompiler } from '../execution-graph/ExecutionCompiler';

export class MissionPlanner {
  static plan(mission: Mission, sessionId: string): SharedPlanningModel {
    const tasks: SpmTask[] = [];

    // Map mission types to specific specialist workflows
    switch (mission.type) {
      case 'repository_analysis':
        tasks.push({
          id: 'repo_analysis',
          name: 'Repository Analysis',
          description: 'Inspect code files and repository layout',
          unitId: 'repository-agent',
          dependencies: [],
        });
        break;

      case 'architecture_review':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Repository Inspection',
            description: 'Inspect current repository files',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'arch_analysis',
            name: 'Architecture Assessment',
            description: 'Analyze architectural styles and components',
            unitId: 'architecture-agent',
            dependencies: ['repo_analysis'],
          },
          {
            id: 'code_review',
            name: 'Compliance Review',
            description: 'Verify project compliance against code standards',
            unitId: 'reviewer-agent',
            dependencies: ['repo_analysis', 'arch_analysis'],
          }
        );
        break;

      case 'documentation_generation':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Repository Scan',
            description: 'Scan repository source code',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'doc_gen',
            name: 'Document Generation',
            description: 'Write comprehensive markdown reference docs',
            unitId: 'documentation-agent',
            dependencies: ['repo_analysis'],
          }
        );
        break;

      case 'diagram_generation':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Repository Code Scan',
            description: 'Scan codebase to understand entities',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'diag_gen',
            name: 'Diagram Generation',
            description: 'Generate flow and layout diagrams',
            unitId: 'diagram-agent',
            dependencies: ['repo_analysis'],
          }
        );
        break;

      case 'security_audit':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Security Scan Target',
            description: 'Gather source code for scanning',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'security_scan',
            name: 'Vulnerability Audit',
            description: 'Conduct static security and credential scans',
            unitId: 'security-agent',
            dependencies: ['repo_analysis'],
          }
        );
        break;

      case 'performance_audit':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Performance Target Scan',
            description: 'Locate heavy processes or files',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'perf_scan',
            name: 'Performance Analysis',
            description: 'Identify bottlenecks and database query issues',
            unitId: 'performance-agent',
            dependencies: ['repo_analysis'],
          }
        );
        break;

      case 'dependency_analysis':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Inspect Package Files',
            description: 'Read dependencies from manifest files',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'dep_scan',
            name: 'Dependency Analysis',
            description: 'Check for out-of-date and duplicate libraries',
            unitId: 'devops-agent',
            dependencies: ['repo_analysis'],
          }
        );
        break;

      case 'onboarding_report':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Repository Audit',
            description: 'Audit project structure',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'arch_analysis',
            name: 'Architecture Analysis',
            description: 'Trace components and communication flow',
            unitId: 'architecture-agent',
            dependencies: ['repo_analysis'],
          },
          {
            id: 'doc_gen',
            name: 'Onboarding Guide Writing',
            description: 'Produce developer onboarding markdown documents',
            unitId: 'documentation-agent',
            dependencies: ['repo_analysis', 'arch_analysis'],
          }
        );
        break;

      case 'technology_assessment':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Repository Code Audit',
            description: 'Scan dependencies and structures',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'arch_analysis',
            name: 'Tech Stack Review',
            description: 'Assess architecture and stack decisions',
            unitId: 'architecture-agent',
            dependencies: ['repo_analysis'],
          },
          {
            id: 'reviewer_analysis',
            name: 'Assessment and Recommendations',
            description: 'Review tech stack health and code patterns',
            unitId: 'reviewer-agent',
            dependencies: ['repo_analysis', 'arch_analysis'],
          }
        );
        break;

      case 'migration_planning':
        tasks.push(
          {
            id: 'repo_analysis',
            name: 'Inspect Current Source',
            description: 'Analyze files that will be migrated',
            unitId: 'repository-agent',
            dependencies: [],
          },
          {
            id: 'arch_analysis',
            name: 'Architecture Evaluation',
            description: 'Assess runtime dependencies',
            unitId: 'architecture-agent',
            dependencies: ['repo_analysis'],
          },
          {
            id: 'db_analysis',
            name: 'Database Schema Evaluation',
            description: 'Inspect schemas for migration complexity',
            unitId: 'database-agent',
            dependencies: ['repo_analysis'],
          },
          {
            id: 'infra_plan',
            name: 'DevOps & Migration Execution Plan',
            description: 'Create migration strategy and build jobs',
            unitId: 'devops-agent',
            dependencies: ['repo_analysis', 'arch_analysis', 'db_analysis'],
          }
        );
        break;

      case 'custom':
      default:
        // Build tasks dynamically from the mission objectives list
        for (const objective of mission.objectives) {
          if (!objective.unitId) {
            throw new Error(`Objective "${objective.id}" must specify a unitId for planning`);
          }
          tasks.push({
            id: objective.id,
            name: objective.name,
            description: objective.description,
            unitId: objective.unitId,
            dependencies: objective.dependsOn ? [...objective.dependsOn] : [],
          });
        }
        break;
    }

    // Apply mission constraints as task resource limits
    const tasksWithLimits = tasks.map((task) => ({
      ...task,
      resourceLimits: {
        costLimit: mission.constraints.maxCost,
        timeoutMs: mission.constraints.maxLatencyMs,
      },
    }));

    return {
      taskId: mission.id,
      sessionId,
      goal: mission.goal,
      tasks: tasksWithLimits,
      metadata: mission.metadata,
    };
  }

  static compile(spm: SharedPlanningModel): ExecutionGraph {
    return ExecutionCompiler.compile(spm);
  }
}
