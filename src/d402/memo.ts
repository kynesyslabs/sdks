/**
 * The memo a d402 payment carries: `resourceId:<id>`, followed by
 * ` - <description>` when the requirement has one.
 */
export function d402Memo(resourceId: string, description?: string): string {
    return description
        ? `resourceId:${resourceId} - ${description}`
        : `resourceId:${resourceId}`
}
