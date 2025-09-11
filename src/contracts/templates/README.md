# Demos Network Contract Templates

This directory contains standard contract templates for the Demos Network, providing developers with pre-built, tested contracts for common use cases.

## Overview

The template system provides:

- **Type-safe Templates**: Full TypeScript validation during development
- **Parameter Validation**: Comprehensive parameter checking before deployment
- **Parameter Substitution**: Safe injection of user parameters into contract code
- **Documentation**: Complete usage examples and API reference

## Available Templates

### 1. Token Template

A full-featured token contract with ERC-20-like functionality:

- **Name**: `Token`
- **Features**: Transfer, allowance, mint, burn, full event emission
- **Parameters**:
  - `TOKEN_NAME` (string): Token name (e.g., "My Token")
  - `TOKEN_SYMBOL` (string): Token symbol (e.g., "MTK") 
  - `TOTAL_SUPPLY` (number): Initial supply
  - `DECIMALS` (number): Decimal places (default: 18)

**Example Usage**:
```typescript
const token = await demos.contracts.deployTemplate('Token', {
    TOKEN_NAME: 'DemoToken',
    TOKEN_SYMBOL: 'DEMO',
    TOTAL_SUPPLY: 1000000,
    DECIMALS: 18
})

// Use the deployed token
await token.transfer('recipient_address', 100)
const balance = await token.balanceOf('address')
```

### 2. Storage Template

A key-value storage contract with access control:

- **Name**: `Storage`
- **Features**: Store/retrieve data, access control, ownership management
- **Parameters**:
  - `IS_PUBLIC` (boolean): Allow public read access (default: false)
  - `MAX_KEYS` (number): Maximum keys allowed (default: 1000)

**Example Usage**:
```typescript
const storage = await demos.contracts.deployTemplate('Storage', {
    IS_PUBLIC: false,
    MAX_KEYS: 500
})

// Use the deployed storage
await storage.store('myKey', 'myValue')
const value = await storage.retrieve('myKey')
```

## Using Templates

### Basic Deployment

```typescript
import { Demos } from '@kynesyslabs/demosdk'

const demos = new Demos('your-rpc-url')
await demos.connect() // Connect wallet

// Deploy with default parameters
const contract = await demos.contracts.deployTemplate('Token', {
    TOKEN_NAME: 'MyToken',
    TOKEN_SYMBOL: 'MTK',
    TOTAL_SUPPLY: 1000000
})
```

### Parameter Validation

```typescript
// Validate parameters before deployment
const validation = demos.contracts.validateTemplate('Token', {
    TOKEN_NAME: 'MyToken',
    TOKEN_SYMBOL: 'MTK', 
    TOTAL_SUPPLY: 1000000
})

if (!validation.valid) {
    console.error('Validation errors:', validation.errors)
    return
}

// Parameters are valid, proceed with deployment
const contract = await demos.contracts.deployTemplate('Token', validation.processedParams)
```

### Exploring Templates

```typescript
// Get all available templates
const templates = demos.contracts.getAvailableTemplates()
console.log(templates) // ['Token', 'Storage']

// Get template schema and parameters
const schema = demos.contracts.getTemplateSchema('Token')
console.log(schema.parameters) // Detailed parameter information

// Get usage example
const example = demos.contracts.getTemplateExample('Token')
console.log(example) // Complete usage example
```

## Template Architecture

### Template Registry

The `TemplateRegistry` class manages all templates:

- **Registration**: Templates are registered with metadata and validation schemas
- **Validation**: Parameters are validated using comprehensive type and range checking
- **Generation**: Template source code is generated with parameter substitution

### Parameter System

Each template defines parameters with:

- **Type**: `string`, `number`, `boolean`, `address`
- **Validation**: Required/optional, min/max values, patterns
- **Defaults**: Default values for optional parameters
- **Documentation**: Human-readable descriptions

### Code Generation

Template generation process:

1. **Load Template**: Read TypeScript template file
2. **Validate Parameters**: Check all parameters against schema
3. **Substitute Parameters**: Replace `{{PARAM_NAME}}` placeholders
4. **Generate Source**: Return deployable contract source code

## Parameter Validation

The validation system provides comprehensive checking:

### Type Validation
```typescript
{
    name: 'TOTAL_SUPPLY',
    type: 'number',
    required: true,
    min: 1,
    max: 1000000000000,
    description: 'Initial token supply'
}
```

### Pattern Validation
```typescript
{
    name: 'TOKEN_SYMBOL',
    type: 'string', 
    pattern: /^[A-Z]{1,8}$/,
    description: 'Token symbol (1-8 uppercase letters)'
}
```

### Custom Validation
The validator provides warnings for edge cases:
- Large supply values
- Unusual parameter combinations
- Potential security issues

## Error Handling

The template system provides detailed error messages:

### Validation Errors
```
❌ Validation failed

Errors:
  • Required parameter 'TOKEN_NAME' is missing
  • Parameter 'TOTAL_SUPPLY' must be at least 1, got 0
  • Parameter 'TOKEN_SYMBOL' does not match required pattern

Warnings:
  • Large supply value for 'TOTAL_SUPPLY': 999999999999. Consider decimal precision.
```

### Deployment Errors
```typescript
try {
    const contract = await demos.contracts.deployTemplate('Token', params)
} catch (error) {
    if (error.message.includes('Template deployment failed')) {
        // Handle validation errors
        console.error('Parameter validation failed:', error.message)
    } else {
        // Handle network/deployment errors
        console.error('Deployment failed:', error.message)
    }
}
```

## Best Practices

### Parameter Naming
- Use `SCREAMING_SNAKE_CASE` for template parameters
- Be descriptive: `TOKEN_NAME` not `NAME`
- Include type hints in names where helpful

### Template Development
- Validate all user inputs in template code
- Use meaningful error messages with `this.revert()`
- Emit comprehensive events for all state changes
- Include access control where appropriate

### Security Considerations
- Always validate parameters before deployment
- Use the template validation system - don't bypass it
- Test templates thoroughly before using in production
- Be aware of gas costs for complex templates

## Advanced Usage

### Custom Templates

You can register custom templates:

```typescript
import { TemplateRegistry, TemplateInfo } from '@kynesyslabs/demosdk'

const customTemplate: TemplateInfo = {
    name: 'MyCustomTemplate',
    schema: {
        name: 'MyCustomTemplate',
        description: 'Custom contract template',
        version: '1.0.0',
        parameters: [
            {
                name: 'PARAM_NAME',
                type: 'string',
                required: true,
                description: 'Parameter description'
            }
        ]
    },
    sourceFile: 'MyCustomTemplate.contract.ts'
}

TemplateRegistry.registerTemplate(customTemplate)
```

### Batch Template Deployment

```typescript
const batch = demos.contracts.batch()
    .deploy(tokenSource, [])
    .deploy(await TemplateRegistry.generateContract('Storage', storageParams).source, [])

const results = await batch.execute()
```

## Troubleshooting

### Common Issues

1. **"Template not found"**
   - Check template name spelling
   - Ensure template is registered
   - Use `getAvailableTemplates()` to see available templates

2. **"Parameter validation failed"**  
   - Check parameter types and values
   - Use `validateTemplate()` to see specific errors
   - Refer to template schema for requirements

3. **"Deployment failed"**
   - Check wallet connection
   - Ensure sufficient balance for deployment
   - Verify network connectivity

### Getting Help

- Check the template schema: `getTemplateSchema(templateName)`
- View usage examples: `getTemplateExample(templateName)`  
- Validate parameters first: `validateTemplate(templateName, params)`
- Review error messages for specific guidance

## Contributing Templates

To contribute new templates:

1. Create a `.contract.ts` file with your template
2. Define the template schema with full parameter validation
3. Register the template in `TemplateRegistry`
4. Add comprehensive tests
5. Update this documentation

Templates should follow Demos Network conventions and include:
- Proper access control
- Comprehensive event emission
- Input validation
- Clear error messages
- Gas optimization where possible