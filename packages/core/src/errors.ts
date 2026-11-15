export class PluginSetupError extends Error {
  readonly pluginId: string;
  constructor(pluginId: string, cause: unknown) {
    super(`Plugin "${pluginId}" setup failed: ${String(cause)}`);
    this.name = "PluginSetupError";
    this.pluginId = pluginId;
    this.cause = cause;
  }
}

export class LoaderConflictError extends Error {
  constructor(scheme: string) {
    super(`Multiple loaders registered for scheme "${scheme}"`);
    this.name = "LoaderConflictError";
  }
}

export class FragmentConflictError extends Error {
  readonly kind: "parts" | "assets";
  readonly id: string;
  constructor(kind: "parts" | "assets", id: string, existing: unknown, incoming: unknown) {
    super(
      `Fragment conflict on ${kind} id "${id}": existing=${JSON.stringify(existing)} incoming=${JSON.stringify(incoming)}`,
    );
    this.name = "FragmentConflictError";
    this.kind = kind;
    this.id = id;
  }
}

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectionError";
  }
}
