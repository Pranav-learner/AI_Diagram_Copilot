export class PermissionManager {
  /**
   * Evaluates if a set of granted permissions satisfies a required permission.
   * Supports wildcards (e.g., '*' matches anything, 'diagram:*' matches 'diagram:generate').
   */
  static hasPermission(granted: readonly string[], required: string): boolean {
    if (granted.includes('*')) {
      return true;
    }

    if (granted.includes(required)) {
      return true;
    }

    // Check namespace wildcards (e.g. "diagram:*" matches "diagram:generate")
    for (const g of granted) {
      if (g.endsWith(':*')) {
        const prefix = g.slice(0, -2); // "diagram:"
        if (required.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Evaluates if all required permissions are satisfied by the granted set.
   */
  static hasAllPermissions(granted: readonly string[], required: readonly string[]): boolean {
    return required.every((req) => this.hasPermission(granted, req));
  }

  readonly grantedPermissions: string[] = [];

  constructor(initialPermissions: readonly string[] = []) {
    this.grantedPermissions = [...initialPermissions];
  }

  grant(permission: string): void {
    if (!this.grantedPermissions.includes(permission)) {
      this.grantedPermissions.push(permission);
    }
  }

  revoke(permission: string): void {
    const idx = this.grantedPermissions.indexOf(permission);
    if (idx !== -1) {
      this.grantedPermissions.splice(idx, 1);
    }
  }

  check(required: string): boolean {
    return PermissionManager.hasPermission(this.grantedPermissions, required);
  }

  checkAll(required: readonly string[]): boolean {
    return PermissionManager.hasAllPermissions(this.grantedPermissions, required);
  }
}
