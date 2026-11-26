/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Central Agent Registry Implementation
 *
 * Strict Architectural Boundary:
 * - Centralized registry for the four CRM AI agent personas.
 * - Single approved model policy: strictly 'gemini-2.5-flash'.
 * - Explicit task-type allowlisting and role-based access checks.
 * - Immutable agent definitions.
 */

import { AiAgentId, AiTaskType, GatewayUserRole } from '../types';
import { GatewayValidationError, ContextAuthorizationError } from '../errors';
import { AgentDefinition } from './types';
import {
  PROMPT_VERSIONS,
  SALES_INTELLIGENCE_SYSTEM_PROMPT,
  LEAD_DIAGNOSTIC_SYSTEM_PROMPT,
  EXECUTIVE_BRIEFING_SYSTEM_PROMPT,
  WORKFLOW_ARCHITECT_SYSTEM_PROMPT,
  LEAD_COACH_RESPONSE_SCHEMA,
  EXECUTIVE_BRIEFING_RESPONSE_SCHEMA,
  WORKFLOW_GENERATION_RESPONSE_SCHEMA,
} from './prompts';

/**
 * Authoritative registrations for the four Developster CRM agents.
 */
const REGISTERED_AGENTS: Record<AiAgentId, AgentDefinition> = {
  sales_intelligence_agent: {
    id: 'sales_intelligence_agent',
    name: 'Sales Intelligence & Strategy Agent',
    version: PROMPT_VERSIONS.SALES_INTELLIGENCE,
    purpose: 'Interactive conversational sales director and deal strategist providing consultative advice, deal answers, and action recommendations.',
    systemPrompt: SALES_INTELLIGENCE_SYSTEM_PROMPT,
    allowedTaskTypes: ['sales_chat', 'summarization'],
    allowedRoles: ['owner', 'admin', 'manager', 'member', 'read-only', 'system'],
    approvedTools: ['get_lead_details', 'search_leads', 'query_pipeline_metrics', 'create_task', 'search_knowledge_base'],
    contextRequirements: ['workspaceId', 'activeLeadId (optional)', 'conversationHistory'],
  },

  lead_diagnostic_agent: {
    id: 'lead_diagnostic_agent',
    name: 'Lead Diagnostic & Deal Coach Agent',
    version: PROMPT_VERSIONS.LEAD_DIAGNOSTIC,
    purpose: 'Deep diagnostic evaluation of leads and opportunities, scoring buyer sentiment, risk factors, and delivering multi-touch action plans.',
    systemPrompt: LEAD_DIAGNOSTIC_SYSTEM_PROMPT,
    allowedTaskTypes: ['lead_coach'],
    allowedRoles: ['owner', 'admin', 'manager', 'member', 'read-only', 'system'],
    approvedTools: ['get_lead_details', 'search_knowledge_base'],
    responseSchema: LEAD_COACH_RESPONSE_SCHEMA,
    contextRequirements: ['leadId', 'leadData', 'interactionHistory'],
  },

  executive_briefing_agent: {
    id: 'executive_briefing_agent',
    name: 'Executive Pipeline Briefing Agent',
    version: PROMPT_VERSIONS.EXECUTIVE_BRIEFING,
    purpose: 'Daily executive synthesis of pipeline momentum, revenue at risk, high-value opportunities, and dormant accounts.',
    systemPrompt: EXECUTIVE_BRIEFING_SYSTEM_PROMPT,
    allowedTaskTypes: ['executive_briefing', 'summarization'],
    // Executive pipeline metrics require at least manager/admin authority
    allowedRoles: ['owner', 'admin', 'manager', 'system'],
    approvedTools: ['query_pipeline_metrics', 'search_leads', 'get_lead_details'],
    responseSchema: EXECUTIVE_BRIEFING_RESPONSE_SCHEMA,
    contextRequirements: ['pipelineSummary', 'coldLeadsData'],
  },

  workflow_architect_agent: {
    id: 'workflow_architect_agent',
    name: 'Workflow & Automation Architect Agent',
    version: PROMPT_VERSIONS.WORKFLOW_ARCHITECT,
    purpose: 'Translates natural language automation requirements into validated, executable visual node graph workflows.',
    systemPrompt: WORKFLOW_ARCHITECT_SYSTEM_PROMPT,
    allowedTaskTypes: ['workflow_generation'],
    // Automations require administrative/managerial privileges
    allowedRoles: ['owner', 'admin', 'manager', 'system'],
    approvedTools: [],
    responseSchema: WORKFLOW_GENERATION_RESPONSE_SCHEMA,
    contextRequirements: ['prompt', 'availableStages', 'teamMembers'],
  },

  system_probe_agent: {
    id: 'system_probe_agent',
    name: 'System Diagnostic Probe Agent',
    version: '1.0.0',
    purpose: 'Internal health check and connectivity probe agent.',
    systemPrompt: 'You are an internal system probe agent. Return "OK" for connectivity verification.',
    allowedTaskTypes: ['connection_probe'],
    allowedRoles: ['owner', 'admin', 'system'],
    approvedTools: [],
  },
};

/**
 * Central Agent Registry managing persona specifications, versioning, and access validation.
 */
export class AgentRegistry {
  private readonly agents: Map<AiAgentId, AgentDefinition>;

  constructor(initialAgents: Record<string, AgentDefinition> = REGISTERED_AGENTS) {
    this.agents = new Map<AiAgentId, AgentDefinition>();
    for (const [key, def] of Object.entries(initialAgents)) {
      this.agents.set(key as AiAgentId, Object.freeze({ ...def }));
    }
  }

  /**
   * Retrieves a registered agent by identifier.
   */
  public getAgent(agentId: AiAgentId): AgentDefinition | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Checks if an agent identifier is registered.
   */
  public hasAgent(agentId: string): agentId is AiAgentId {
    return this.agents.has(agentId as AiAgentId);
  }

  /**
   * Returns all registered agent definitions.
   */
  public getAllAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /**
   * Validates that an agent exists, is authorized for the given task type,
   * and that the caller's role is permitted to invoke it.
   */
  public validateAgentTask(
    agentId: AiAgentId,
    taskType: AiTaskType,
    userRole: GatewayUserRole
  ): AgentDefinition {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new GatewayValidationError(
        `Agent '${agentId}' is not registered in the Central Agent Registry. Approved agents: ${Array.from(this.agents.keys()).join(', ')}`
      );
    }

    // Validate task type authorization
    if (!agent.allowedTaskTypes.includes(taskType)) {
      throw new GatewayValidationError(
        `Agent '${agentId}' does not support task type '${taskType}'. Allowed task types: ${agent.allowedTaskTypes.join(', ')}`
      );
    }

    // Validate role authorization
    if (!agent.allowedRoles.includes(userRole)) {
      throw new ContextAuthorizationError(
        `User role '${userRole}' is not authorized to invoke agent '${agentId}'. Required roles: ${agent.allowedRoles.join(', ')}`
      );
    }

    return agent;
  }
}

// Global Agent Registry Singleton
export const agentRegistry = new AgentRegistry();
