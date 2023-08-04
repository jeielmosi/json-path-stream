import { Transform, TransformOptions, TransformCallback } from "node:stream";
import { LinkedList } from "../shared/structs/linked-list";
import { Stack } from "../shared/structs/stack";
import { JSONAtomicTypesEnum } from "../shared/types/json";
import { JSONTokens } from "../shared/enums/json-tokens";
import { Message, MessageStatus, MessageTypesEnum } from "../shared/types/message";

export class JSONSlicerBroker {
    private stack: Stack<JSONTokens>;
    private buffer: string;
    private input: LinkedList<string>;
    private output: LinkedList<Message>;

    private path: Array<string | number>;
    private nextPosition: Stack<string | number>;

    constructor() {
        this.path = [];
        this.buffer = "";
        this.input = new LinkedList<string>();
        this.output = new LinkedList<Message>();
        this.stack = new Stack<JSONTokens>();
        this.nextPosition = new Stack<string | number>();
    }

    push(str: string) {
        this.input.push(str);
    }
    
    pop(): Message[] {
        const answer: Message[] = [];
        while (true) {
            const top = this.output.pop();
            if (top === undefined) {
                break;
            }
            answer.push(top);
        }
        return answer;
    }

    parse() {
        this._parse();
        if (this.path.length === 0 && this.input.top() === undefined) {
            this.input.push(' ');
            this._parse();
        }
    }

    private updateBuffer() {
        while (true) {
            const top = this.input.pop();
            if (top === undefined) {
                break;
            }
            this.buffer += top;
        } 
        this.consumeSpaceTokens();
    }

    private _parse() {
        let ok = true;
        while (ok) {
            ok = false;
            
            this.updateBuffer();
            
            const token = this.stack.top();
            if (token === JSONTokens.COLON) {
                ok = this.parseString();
                if (ok) {
                    continue;
                }
            }

            ok = this.parseArray() || 
                this.parseObject() || 
                this.parseString() || 
                this.parseAtomicType();
        }
    }

    private parseAtomicType(): boolean {
        const dict = {
            [JSONAtomicTypesEnum.BOOLEAN]: /(true)|(false)/,
            [JSONAtomicTypesEnum.NUMBER]: /-?(0|[1-9][0-9]*)\.?\d*(e-?\d+)?/,
            [JSONAtomicTypesEnum.NULL]: /null/,
        };
    
        let atomic: string | undefined = undefined;
        for ( const regex of Object.values(dict) ) {
            
            [atomic] = this.buffer.match(regex) ?? [];
            if ( atomic !== undefined && this.buffer.startsWith(atomic) ) {
                break;
            }
        }
    
        if (atomic === undefined) {
            return false;
        }

        const tokens = [
            JSONTokens.OBJECT_CLOSE, JSONTokens.ARRAY_CLOSE,
            JSONTokens.COMA, JSONTokens.ESPACE, JSONTokens.NEW_LINE, JSONTokens.TAB
        ];
        for (const token of tokens) {
            if ( this.buffer.startsWith(atomic + token) ) {
                this.buffer = this.buffer.substring(atomic.length);
                this.pathExpansion();
                
                const value = JSON.parse(atomic)
                this.output.push({
                    path: Array.from(this.path),
                    status: MessageStatus.RESULT,
                    value
                });

                this.path.pop();
                return true;
            }
        }

        return false;
    }

    private parseArray(): boolean {
        if ( this.buffer.startsWith(JSONTokens.ARRAY_CLOSE) ) {
            this.buffer = this.buffer.substring(JSONTokens.ARRAY_CLOSE.length);
            this.path.pop();
            this.stack.pop();
            this.nextPosition.pop();

            this.output.push({
                path: Array.from(this.path),
                status: MessageStatus.END,
            });

            return true;
        }
        
        if ( this.buffer.startsWith(JSONTokens.ARRAY_OPEN) ) {
            this.buffer = this.buffer.substring(JSONTokens.ARRAY_OPEN.length);
            this.pathExpansion();
            this.nextPosition.push(0);
            this.stack.push(JSONTokens.ARRAY_OPEN);

            this.output.push({
                path: Array.from(this.path),
                status: MessageStatus.START,
                type: MessageTypesEnum.ARRAY
            });

            return true;
        }
        
        if (this.stack.top() !== JSONTokens.ARRAY_OPEN) {
            return false;
        }

        if ( this.buffer.startsWith(JSONTokens.COMA) ) {
            this.buffer = this.buffer.substring(JSONTokens.COMA.length);
            const index = this.nextPosition.pop() as number;
            this.nextPosition.push(index + 1);

            return true;
        }

        return false;
    }
    
    private parseString(): boolean {
        const size = this.getString();
        if (size === 0) {
            return false;
        }

        const value = JSON.parse( this.buffer.substring(0, size) );
        this.buffer = this.buffer.substring(size);

        this.pathExpansion();
                
        this.output.push({
            path: Array.from(this.path),
            status: MessageStatus.RESULT,
            value
        });

        this.path.pop();
        return true;
    }

    private getString(): number {
        if ( !this.buffer.startsWith(JSONTokens.STRING_OPEN) ) {
            return 0;
        }
        let size = JSONTokens.STRING_OPEN.length;

        while (size < this.buffer.length) {
            let c = this.buffer.substring(size,size+1);
            switch (c) {
                case JSONTokens.STRING_CLOSE:
                    size += JSONTokens.STRING_CLOSE.length;
                    return size;
                case JSONTokens.BACKSLASH:
                    if (this.buffer.length < size + 2) {
                        return 0;
                    }
                    size += 1;
                default:
                    size += 1;
                    break;
            }
        }
        return 0;
    }

    private parseObject(): boolean {
        if ( this.buffer.startsWith(JSONTokens.OBJECT_CLOSE) ) {
            this.buffer = this.buffer.substring(JSONTokens.OBJECT_CLOSE.length);
            if (this.stack.top() === JSONTokens.COLON) {
                this.stack.pop();
            }
            this.stack.pop();
            this.nextPosition.pop();
            this.output.push({
                path: Array.from(this.path),
                status: MessageStatus.END,
            });
            this.path.pop();
            return true;
        }

        if ( this.buffer.startsWith(JSONTokens.OBJECT_OPEN) ) {
            this.buffer = this.buffer.substring(JSONTokens.OBJECT_OPEN.length);
            this.pathExpansion();
            this.stack.push(JSONTokens.OBJECT_OPEN);
            this.output.push({
                path: Array.from(this.path),
                status: MessageStatus.START,
                type: MessageTypesEnum.OBJECT
            });
            return true;
        }
        
        if (this.stack.top() !== JSONTokens.OBJECT_OPEN && this.stack.top() !== JSONTokens.COLON) {
            return false;
        }

        if ( this.buffer.startsWith(JSONTokens.COMA) ) {
            this.buffer = this.buffer.substring(JSONTokens.COMA.length);
            this.nextPosition.pop();
            this.stack.pop();
            return true;    
        }
        
        if ( this.buffer.startsWith(JSONTokens.COLON) ) {
            this.buffer = this.buffer.substring(JSONTokens.COLON.length);
            this.stack.push(JSONTokens.COLON);
            return true;    
        }


        const size = this.getString();
        if (size === 0) {
            return false;
        }

        const value = JSON.parse( this.buffer.substring(0, size) );
        this.buffer = this.buffer.substring(size);
        this.nextPosition.push(value);

        return true;
    }

    private consumeSpaceTokens () {
        const spaceTokens = [JSONTokens.ESPACE, JSONTokens.NEW_LINE, JSONTokens.TAB];
        let size = 0;
        while (true) {
            let ok = false;
            for ( const token of Object.values(spaceTokens) ) {
                if (this.buffer.substring(size, size + token.length) === token) {
                    size += token.length;
                    ok = true;
                }
            }

            if (ok === false) {
                break;
            }
        }

        if (0 < size) {
            this.buffer = this.buffer.substring(size);
        }
    }

    private pathExpansion() {
        const top = this.nextPosition.top(); 
        if (top !== undefined) {
            this.path.push(top);
        }
    }
}

export class JSONSlicerTransform extends Transform {
    broker: JSONSlicerBroker;
    constructor(opts?: TransformOptions) {
        super(opts);
        this.broker = new JSONSlicerBroker();
    }

    _transform(chunk: any, _: BufferEncoding, callback: TransformCallback): void {
        const input = String(chunk);
        this.broker.push(input);
        this.broker.parse();
        const answer = this.broker.pop();
        if (answer.length > 0) {
            callback(null, JSON.stringify(answer, null, 0) );
        }
    }
}