export enum JSONAtomicTypesEnum {
    NULL = 'null',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
}

export type JSONAtomicType = number | boolean | null;

export enum JSONExpandableTypesEnum {
    ARRAY = 'array',
    OBJECT = 'object',
    STRING = 'string',
}

export type JSONExpandableType = Record<string, unknown> | unknown[] | string
