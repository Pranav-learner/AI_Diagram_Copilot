import type { ExecutionContext } from '../execution/ExecutionContext';

export interface Tool {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: any; // e.g. ZodSchema or custom validator
  readonly permissionsRequired: readonly string[];
  readonly metadata?: Readonly<Record<string, any>>;

  execute(args: any, context: ExecutionContext): Promise<any>;
}
