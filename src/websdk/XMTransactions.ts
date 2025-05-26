// INFO Use the src/features/multichain/chainscript/chainscript.chs for the specs
// NOTE This module is meant to be used with the demos websdk

import { getNewUID } from "@/demoswork/utils"
import type { Transaction, XMScript } from "@/types"
import { DemosTransactions } from "./DemosTransactions"
import { IKeyPair } from "./types/KeyPair"
import { Demos } from "./demosclass"

// INFO Using the methods below to create, manage and send chainscript-like scripts
const XMTransactions = {
    schemas: {
        base_operation: {
            chain: "",
            subchain: "",
            is_evm: false,
            rpc: "",
            conditional: false,
            task: {
                type: "",
                params: {},
                signedPayloads: <any[]>[],
            },
        },
        condition_operation: {
            operator: "",
            statement: "",
            callback: "",
            alternative: "",
        },
    },

    data: {
        // NOTE This is a list of all operations that have been loaded in the current session
        loaded_operations: <{ [key: string]: any }>{},
        operations_index: <(string | number)[]>[],
    },

    task: {},

    operation: {
        // ANCHOR Setters

        // NOTE Creating and adding a new operation to the current session list
        // megabudino was here: I added the conditional parameter; changed operation.task = task to not overwrite
        create: function (
            name: string | number,
            chain: string,
            subchain: string,
            is_evm: boolean,
            rpc: string,
            task: { type: string; params: {}; signedPayloads: any[] },
            conditional = false,
        ) {
            // TODO Bugfix: implement a name
            const operation = { ...XMTransactions.schemas.base_operation }
            operation.chain = chain
            operation.subchain = subchain
            operation.is_evm = is_evm
            operation.rpc = rpc
            operation.conditional = conditional
            operation.task = task
            XMTransactions.data.loaded_operations[name] = operation
            XMTransactions.data.operations_index.push(name)
            return operation
        },

        // megabudino was here: this is the function that creates the condition operation
        create_condition: function (
            name: string | number,
            operator: string,
            statement: string,
            callback: string,
            alternative: string,
        ) {
            const condition = { ...XMTransactions.schemas.condition_operation }
            condition.operator = operator
            condition.statement = statement
            condition.callback = callback
            condition.alternative = alternative
            XMTransactions.data.loaded_operations[name] = condition
            XMTransactions.data.operations_index.push(name)
            return condition
        },

        // megabudino was here: this is the function to push signed payloads to the task
        push_signed_payload: function (
            name: string | number,
            signed_payload: any,
        ) {
            XMTransactions.data.loaded_operations[
                name
            ].task.signedPayloads.push(signed_payload)
        },

        // NOTE Deleting an operation from the current session list
        delete: function (name: string | number) {
            delete XMTransactions.data.loaded_operations[name]
            const index = XMTransactions.data.operations_index.indexOf(name)
            XMTransactions.data.operations_index.splice(index, 1)
        },

        clear: function () {
            XMTransactions.data.loaded_operations = {}
            XMTransactions.data.operations_index = []
        },

        // NOTE Changing operation order for an operation from the current session list
        reorder: function (name: any, index: number) {
            // FIXME Security: check boundaries to avoid circling
            const operation_current =
                XMTransactions.data.operations_index.indexOf(name)
            // Deleting and...
            XMTransactions.data.operations_index.splice(operation_current, 1)
            // ...inserting it at the new index
            XMTransactions.data.operations_index.splice(index, 0, name)
        },

        // NOTE Updating an operation from the current session list
        // megabudino was here: I added the conditional parameter; changed operation.task = task to not overwrite
        update: function (
            name: string | number,
            chain: string,
            subchain: string,
            is_evm: boolean,
            rpc: string,
            task: { type: string; params: {} },
            conditional: boolean,
        ) {
            const operation = { ...XMTransactions.schemas.base_operation }
            operation.chain = chain
            operation.subchain = subchain
            operation.is_evm = is_evm
            operation.rpc = rpc
            operation.task.type = task.type
            operation.task.params = task.params
            operation.conditional = conditional
            XMTransactions.data.loaded_operations[name] = operation
        },

        // ANCHOR Getters

        // NOTE Getting all the operations from the current session list
        get: function () {
            return XMTransactions.data.loaded_operations
        },

        // NOTE Getting an operation from the current session list by name
        get_by_name: function (name: string | number) {
            return XMTransactions.data.loaded_operations[name]
        },

        get_ordered_index: function () {
            return XMTransactions.data.operations_index
        },
    },
}

interface prepareXMScriptParams {
    chain: string
    subchain: string
    signedPayloads: any[]
    type: string
    rpc?: string
    is_evm?: boolean
    params?: any
}

export function prepareXMScript({
    chain,
    is_evm,
    subchain,
    signedPayloads,
    type,
    params,
    rpc,
}: prepareXMScriptParams) {
    const id = getNewUID()

    return {
        operations: {
            [id]: {
                chain,
                is_evm: is_evm || (chain === "eth" ? true : false),
                subchain,
                task: {
                    type,
                    signedPayloads: [...signedPayloads],
                    params: params || null,
                },
                rpc,
            },
        },
        operations_order: [id],
    } as XMScript
}

async function prepareXMPayload(
    xm_payload: XMScript,
    demos: Demos,
): Promise<Transaction> {
    var xm_transaction: Transaction = DemosTransactions.empty()
    // From and To are the same in XM transactions
    // xm_transaction.content.from = demos.keypair.publicKey as Uint8Array
    xm_transaction.content.to = "0x9fdab6eaa302929de6c72a4dac2bad3b6d71a373b6cf81729a5e3c7979ef82a6"
    // Setting the type and data
    xm_transaction.content.type = "crosschainOperation"
    xm_transaction.content.data = ["crosschainOperation", xm_payload]
    // Producing a timestamp
    xm_transaction.content.timestamp = Date.now()
    // Signing the transaction
    return await demos.sign(xm_transaction)
}

export { prepareXMPayload, XMTransactions }
