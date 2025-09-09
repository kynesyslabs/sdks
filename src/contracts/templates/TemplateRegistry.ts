/**
 * Template Registry with Parameter Substitution
 * 
 * Manages contract templates, validates parameters, and performs
 * parameter substitution to generate deployable contract source code.
 */

// import * as fs from 'fs'
import * as path from 'path'
import { TemplateValidator, TemplateSchema, ValidationResult } from './TemplateValidator'

export interface TemplateInfo {
    name: string
    schema: TemplateSchema
    sourceFile: string
    source?: string // Loaded lazily
}

export interface SubstitutionResult {
    success: boolean
    source?: string
    errors: string[]
    warnings: string[]
}

export class TemplateRegistry {
    private static templates: Map<string, TemplateInfo> = new Map()
    private static initialized = false
    
    /**
     * Initialize the template registry with built-in templates
     */
    static initialize(): void {
        if (this.initialized) return
        
        // Register Token template
        this.registerTemplate({
            name: 'Token',
            schema: {
                name: 'Token',
                description: 'Standard token contract with ERC-20-like functionality',
                version: '1.0.0',
                author: 'Kynesys Labs',
                parameters: [
                    {
                        name: 'TOKEN_NAME',
                        type: 'string',
                        required: true,
                        default: 'DemosToken',
                        pattern: /^[A-Za-z0-9\s]{1,32}$/,
                        description: 'The name of the token (e.g., "My Token")'
                    },
                    {
                        name: 'TOKEN_SYMBOL',
                        type: 'string',
                        required: true,
                        default: 'DTK',
                        pattern: /^[A-Z]{1,8}$/,
                        description: 'The symbol of the token (e.g., "MTK")'
                    },
                    {
                        name: 'TOTAL_SUPPLY',
                        type: 'number',
                        required: true,
                        default: 1000000,
                        min: 1,
                        max: 1000000000000,
                        description: 'Initial token supply'
                    },
                    {
                        name: 'DECIMALS',
                        type: 'number',
                        required: false,
                        default: 18,
                        min: 0,
                        max: 18,
                        description: 'Number of decimal places for the token'
                    }
                ]
            },
            sourceFile: 'Token.ts.template'
        })
        
        // Register Storage template
        this.registerTemplate({
            name: 'Storage',
            schema: {
                name: 'Storage',
                description: 'Key-value storage contract with access control',
                version: '1.0.0',
                author: 'Kynesys Labs',
                parameters: [
                    {
                        name: 'IS_PUBLIC',
                        type: 'boolean',
                        required: false,
                        default: false,
                        description: 'Whether the storage allows public read access'
                    },
                    {
                        name: 'MAX_KEYS',
                        type: 'number',
                        required: false,
                        default: 1000,
                        min: 1,
                        max: 10000,
                        description: 'Maximum number of keys that can be stored'
                    }
                ]
            },
            sourceFile: 'Storage.ts.template'
        })
        
        this.initialized = true
    }
    
    /**
     * Register a new template
     */
    static registerTemplate(templateInfo: TemplateInfo): void {
        this.templates.set(templateInfo.name, templateInfo)
    }
    
    /**
     * Get all available template names
     */
    static getAvailableTemplates(): string[] {
        this.initialize()
        return Array.from(this.templates.keys())
    }
    
    /**
     * Get template information
     */
    static getTemplate(name: string): TemplateInfo | null {
        this.initialize()
        return this.templates.get(name) || null
    }
    
    /**
     * Get template schema for validation
     */
    static getTemplateSchema(name: string): TemplateSchema | null {
        const template = this.getTemplate(name)
        return template ? template.schema : null
    }
    
    /**
     * Load template source code
     */
    private static loadTemplateSource(template: TemplateInfo): string {
        if (template.source) {
            return template.source
        }
        
        try {
            // In a real implementation, you'd load from the file system
            // For now, we'll use the embedded source strings
            // const templatePath = path.join(__dirname, template.sourceFile)
            
            // Since we can't actually read files in this context,
            // we'll return the source based on template name
            return this.getEmbeddedTemplateSource(template.name)
            
        } catch (error) {
            throw new Error(`Failed to load template source for ${template.name}: ${(error as Error).message}`)
        }
    }
    
    /**
     * Get embedded template source (temporary implementation)
     */
    private static getEmbeddedTemplateSource(templateName: string): string {
        // In a real implementation, these would be loaded from .contract.ts files
        const sources: Record<string, string> = {
            'Token': `
class Token extends DemosContract {
    constructor(
        name: string = "{{TOKEN_NAME}}",
        symbol: string = "{{TOKEN_SYMBOL}}", 
        totalSupply: number = {{TOTAL_SUPPLY}},
        decimals: number = {{DECIMALS}}
    ) {
        super()
        this.state.set('name', name)
        this.state.set('symbol', symbol)
        this.state.set('decimals', decimals)
        this.state.set('totalSupply', totalSupply)
        this.state.set('balances', {})
        this.state.set('allowances', {})
        const creator = this.sender
        const balances = this.state.get('balances')
        balances[creator] = totalSupply
        this.state.set('balances', balances)
        this.emit('Transfer', { from: '0x0', to: creator, amount: totalSupply })
    }
    
    name(): string { return this.state.get('name') }
    symbol(): string { return this.state.get('symbol') }
    decimals(): number { return this.state.get('decimals') }
    totalSupply(): number { return this.state.get('totalSupply') }
    
    balanceOf(address: string): number {
        const balances = this.state.get('balances')
        return balances[address] || 0
    }
    
    transfer(to: string, amount: number): boolean {
        const from = this.sender
        return this._transfer(from, to, amount)
    }
    
    private _transfer(from: string, to: string, amount: number): boolean {
        if (!to || to === '0x0') this.revert('Transfer to zero address')
        if (amount <= 0) this.revert('Transfer amount must be positive')
        
        const balances = this.state.get('balances')
        const fromBalance = balances[from] || 0
        if (fromBalance < amount) this.revert('Insufficient balance')
        
        balances[from] = fromBalance - amount
        balances[to] = (balances[to] || 0) + amount
        this.state.set('balances', balances)
        
        this.emit('Transfer', { from, to, amount })
        return true
    }
}`,
            'Storage': `
class Storage extends DemosContract {
    constructor(
        isPublic: boolean = {{IS_PUBLIC}},
        maxKeys: number = {{MAX_KEYS}}
    ) {
        super()
        this.state.set('owner', this.sender)
        this.state.set('isPublic', isPublic)
        this.state.set('maxKeys', maxKeys)
        this.state.set('keyCount', 0)
        this.state.set('data', {})
        this.state.set('authorizedUsers', {})
        
        const authorizedUsers = {}
        authorizedUsers[this.sender] = true
        this.state.set('authorizedUsers', authorizedUsers)
        
        this.emit('StorageCreated', { owner: this.sender, isPublic, maxKeys })
    }
    
    store(key: string, value: any): boolean {
        this._requireWriteAccess()
        this._validateKey(key)
        
        const data = this.state.get('data')
        const isNewKey = !(key in data)
        
        if (isNewKey) {
            const currentKeyCount = this.state.get('keyCount')
            const maxKeys = this.state.get('maxKeys')
            if (currentKeyCount >= maxKeys) this.revert('Maximum key limit reached')
            this.state.set('keyCount', currentKeyCount + 1)
        }
        
        data[key] = { value, timestamp: this.blockHeight, author: this.sender }
        this.state.set('data', data)
        this.emit('ValueStored', { key, value, author: this.sender, isNewKey })
        return true
    }
    
    retrieve(key: string): any {
        this._requireReadAccess()
        this._validateKey(key)
        const data = this.state.get('data')
        const entry = data[key]
        if (!entry) return null
        this.emit('ValueRetrieved', { key, value: entry.value, requester: this.sender })
        return entry.value
    }
    
    private _requireReadAccess(): void {
        const isPublic = this.state.get('isPublic')
        if (isPublic) return
        const authorizedUsers = this.state.get('authorizedUsers')
        if (authorizedUsers[this.sender] !== true) this.revert('Read access denied')
    }
    
    private _requireWriteAccess(): void {
        const authorizedUsers = this.state.get('authorizedUsers')
        if (authorizedUsers[this.sender] !== true) this.revert('Write access denied')
    }
    
    private _validateKey(key: string): void {
        if (!key || typeof key !== 'string') this.revert('Invalid key: must be non-empty string')
        if (key.length > 64) this.revert('Key too long: maximum 64 characters')
        if (key.startsWith('_') || key.includes('\\0')) this.revert('Invalid key format')
    }
}`
        }
        
        return sources[templateName] || ''
    }
    
    /**
     * Validate template parameters
     */
    static validateParameters(
        templateName: string, 
        params: Record<string, any>
    ): ValidationResult {
        this.initialize()
        
        const template = this.getTemplate(templateName)
        if (!template) {
            return {
                valid: false,
                errors: [`Template '${templateName}' not found`],
                warnings: [],
                processedParams: {}
            }
        }
        
        return TemplateValidator.validate(template.schema, params)
    }
    
    /**
     * Generate contract source with parameter substitution
     */
    static generateContract(
        templateName: string,
        params: Record<string, any> = {}
    ): SubstitutionResult {
        this.initialize()
        
        const template = this.getTemplate(templateName)
        if (!template) {
            return {
                success: false,
                errors: [`Template '${templateName}' not found`],
                warnings: []
            }
        }
        
        // Validate parameters
        const validation = this.validateParameters(templateName, params)
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors,
                warnings: validation.warnings
            }
        }
        
        try {
            // Load template source
            const templateSource = this.loadTemplateSource(template)
            
            // Perform parameter substitution
            const substitutedSource = this.substituteParameters(
                templateSource, 
                validation.processedParams
            )
            
            return {
                success: true,
                source: substitutedSource,
                errors: [],
                warnings: validation.warnings
            }
            
        } catch (error) {
            return {
                success: false,
                errors: [`Template generation failed: ${(error as Error).message}`],
                warnings: validation.warnings
            }
        }
    }
    
    /**
     * Perform parameter substitution in template source
     */
    private static substituteParameters(
        source: string, 
        params: Record<string, any>
    ): string {
        let result = source
        
        // Replace each parameter placeholder
        for (const [key, value] of Object.entries(params)) {
            const placeholder = `{{${key}}}`
            const replacement = this.formatParameterValue(value)
            
            // Replace all occurrences
            result = result.replace(new RegExp(placeholder, 'g'), replacement)
        }
        
        // Check for unreplaced placeholders
        const unreplacedMatches = result.match(/\{\{[^}]+\}\}/g)
        if (unreplacedMatches) {
            throw new Error(`Unreplaced template parameters: ${unreplacedMatches.join(', ')}`)
        }
        
        return result
    }
    
    /**
     * Format parameter value for code generation
     */
    private static formatParameterValue(value: any): string {
        if (typeof value === 'string') {
            return `"${value.replace(/"/g, '\\"')}"` // Escape quotes
        } else if (typeof value === 'boolean') {
            return value.toString()
        } else if (typeof value === 'number') {
            return value.toString()
        } else {
            return JSON.stringify(value)
        }
    }
    
    /**
     * Get template usage examples
     */
    static getTemplateExample(templateName: string): string | null {
        this.initialize()
        
        const examples: Record<string, string> = {
            'Token': `
// Deploy a custom token
const token = await demos.contracts.deployTemplate('Token', {
    TOKEN_NAME: 'MyToken',
    TOKEN_SYMBOL: 'MTK',
    TOTAL_SUPPLY: 1000000,
    DECIMALS: 18
})

// Interact with the token
const balance = await token.balanceOf('address')
await token.transfer('recipient', 100)
`,
            'Storage': `
// Deploy a private storage contract
const storage = await demos.contracts.deployTemplate('Storage', {
    IS_PUBLIC: false,
    MAX_KEYS: 500
})

// Use the storage
await storage.store('myKey', 'myValue')
const value = await storage.retrieve('myKey')
`
        }
        
        return examples[templateName] || null
    }
}