export interface ExecutionEdge {
  readonly from: string;
  readonly to: string;
  readonly condition?: (context: any, nodeResults: ReadonlyMap<string, any>) => boolean;
}
