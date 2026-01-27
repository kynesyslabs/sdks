/**
 * Template parameter validation system
 * 
 * Validates template parameters before deployment to ensure
 * safe and correct contract generation.
 */

export interface TemplateParameter {
    name: string
    type: 'string' | 'number' | 'boolean' | 'address'
    required: boolean
    default?: any
    min?: number
    max?: number
    pattern?: RegExp
    description: string
}

export interface TemplateSchema {
    name: string
    description: string
    parameters: TemplateParameter[]
    version: string
    author?: string
}

export interface ValidationResult {
    valid: boolean
    errors: string[]
    warnings: string[]
    processedParams: Record<string, any>
}

export class TemplateValidator {
    
    /**
     * Validate parameters against a template schema
     */
    static validate(
        schema: TemplateSchema, 
        params: Record<string, any> = {}
    ): ValidationResult {
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            processedParams: {}
        }
        
        // Check each parameter in the schema
        for (const paramDef of schema.parameters) {
            const value = params[paramDef.name]
            const hasValue = value !== undefined && value !== null
            
            // Check required parameters
            if (paramDef.required && !hasValue) {
                result.errors.push(`Required parameter '${paramDef.name}' is missing`)
                continue
            }
            
            // Use default value if not provided
            const finalValue = hasValue ? value : paramDef.default
            
            // Skip validation if no value and not required
            if (finalValue === undefined || finalValue === null) {
                continue
            }
            
            // Type validation
            const typeValidation = this.validateType(paramDef, finalValue)
            if (!typeValidation.valid) {
                result.errors.push(...typeValidation.errors)
                continue
            }
            
            // Range validation for numbers
            if (paramDef.type === 'number') {
                const rangeValidation = this.validateNumberRange(paramDef, finalValue)
                if (!rangeValidation.valid) {
                    result.errors.push(...rangeValidation.errors)
                    result.warnings.push(...rangeValidation.warnings)
                }
            }
            
            // Pattern validation for strings
            if (paramDef.type === 'string' && paramDef.pattern) {
                const patternValidation = this.validatePattern(paramDef, finalValue)
                if (!patternValidation.valid) {
                    result.errors.push(...patternValidation.errors)
                }
            }
            
            // Address validation
            if (paramDef.type === 'address') {
                const addressValidation = this.validateAddress(paramDef, finalValue)
                if (!addressValidation.valid) {
                    result.errors.push(...addressValidation.errors)
                }
            }
            
            result.processedParams[paramDef.name] = finalValue
        }
        
        // Check for unknown parameters
        for (const paramName of Object.keys(params)) {
            const isDefined = schema.parameters.some(p => p.name === paramName)
            if (!isDefined) {
                result.warnings.push(`Unknown parameter '${paramName}' will be ignored`)
            }
        }
        
        result.valid = result.errors.length === 0
        return result
    }
    
    /**
     * Validate parameter type
     */
    private static validateType(
        paramDef: TemplateParameter, 
        value: any
    ): ValidationResult {
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            processedParams: {}
        }
        
        const actualType = typeof value
        
        switch (paramDef.type) {
            case 'string':
                if (actualType !== 'string') {
                    result.errors.push(
                        `Parameter '${paramDef.name}' must be a string, got ${actualType}`
                    )
                    result.valid = false
                }
                break
                
            case 'number':
                if (actualType !== 'number' || isNaN(value)) {
                    result.errors.push(
                        `Parameter '${paramDef.name}' must be a number, got ${actualType}`
                    )
                    result.valid = false
                }
                break
                
            case 'boolean':
                if (actualType !== 'boolean') {
                    result.errors.push(
                        `Parameter '${paramDef.name}' must be a boolean, got ${actualType}`
                    )
                    result.valid = false
                }
                break
                
            case 'address':
                if (actualType !== 'string') {
                    result.errors.push(
                        `Parameter '${paramDef.name}' must be an address string, got ${actualType}`
                    )
                    result.valid = false
                }
                break
        }
        
        return result
    }
    
    /**
     * Validate number range
     */
    private static validateNumberRange(
        paramDef: TemplateParameter, 
        value: number
    ): ValidationResult {
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            processedParams: {}
        }
        
        if (paramDef.min !== undefined && value < paramDef.min) {
            result.errors.push(
                `Parameter '${paramDef.name}' must be at least ${paramDef.min}, got ${value}`
            )
            result.valid = false
        }
        
        if (paramDef.max !== undefined && value > paramDef.max) {
            result.errors.push(
                `Parameter '${paramDef.name}' must be at most ${paramDef.max}, got ${value}`
            )
            result.valid = false
        }
        
        // Warnings for edge cases
        if (paramDef.name.includes('Supply') && value > 1000000000) {
            result.warnings.push(
                `Large supply value for '${paramDef.name}': ${value}. Consider decimal precision.`
            )
        }
        
        return result
    }
    
    /**
     * Validate string pattern
     */
    private static validatePattern(
        paramDef: TemplateParameter, 
        value: string
    ): ValidationResult {
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            processedParams: {}
        }
        
        if (paramDef.pattern && !paramDef.pattern.test(value)) {
            result.errors.push(
                `Parameter '${paramDef.name}' does not match required pattern: ${paramDef.pattern}`
            )
            result.valid = false
        }
        
        return result
    }
    
    /**
     * Validate address format
     */
    private static validateAddress(
        paramDef: TemplateParameter, 
        value: string
    ): ValidationResult {
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            processedParams: {}
        }
        
        // Basic address validation (adjust for Demos Network format)
        const addressPattern = /^[a-fA-F0-9]{64}$/
        
        if (!addressPattern.test(value)) {
            result.errors.push(
                `Parameter '${paramDef.name}' is not a valid address format`
            )
            result.valid = false
        }
        
        return result
    }
    
    /**
     * Get human-readable validation summary
     */
    static getValidationSummary(result: ValidationResult): string {
        const lines: string[] = []
        
        if (result.valid) {
            lines.push('✅ Validation passed')
        } else {
            lines.push('❌ Validation failed')
        }
        
        if (result.errors.length > 0) {
            lines.push('\nErrors:')
            result.errors.forEach(error => lines.push(`  • ${error}`))
        }
        
        if (result.warnings.length > 0) {
            lines.push('\nWarnings:')
            result.warnings.forEach(warning => lines.push(`  • ${warning}`))
        }
        
        if (Object.keys(result.processedParams).length > 0) {
            lines.push('\nProcessed parameters:')
            Object.entries(result.processedParams).forEach(([key, value]) => {
                lines.push(`  • ${key}: ${JSON.stringify(value)}`)
            })
        }
        
        return lines.join('\n')
    }
}