import { JSONAtomicType } from "./json"

export enum MessageStatus {
    START = 'start',
    END = 'end',
    RESULT = 'result'
}

export enum MessageTypesEnum {
    ARRAY = 'array',
    OBJECT = 'object',
}

export type EventOptions = {
    status: MessageStatus.START,
    type: MessageTypesEnum
} | {
    status: MessageStatus.RESULT,
    value: JSONAtomicType
} | { status: MessageStatus.END }

export type Message = {
    path: Array<string | number>
} & EventOptions