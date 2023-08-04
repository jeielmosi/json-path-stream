import { Transform, TransformOptions } from "node:stream";
import { TransformCallback } from "stream";
import { Message, MessageStatus } from "../shared/types/message";
import { FilterTokens } from "../shared/enums/filter-tokens";
import { JSONTokens } from "../shared/enums/json-tokens";

type KeyType = string | number;

type DepthType = {
    key: KeyType | null,
    mode: boolean
};

type PathNode = {
    children: Map<KeyType, PathNode | boolean>;
    fallback?: PathNode | boolean;
};

export class JSONFilterBroker {
    private root: PathNode;

    constructor(paths: string[]) {
        if (paths.length === 0) {
            throw new Error("No path defined!");
        }

        this.root = {
            children: new Map<KeyType, PathNode | boolean>(),
        };

        for (const path of paths) {
            for ( const arr of this.generatePaths(path) ) {
                this.addSubPath(this.root, arr);
            }
        }
    }

    private addSubPath(node: PathNode, path: Array<DepthType>, index: number = 0) {
        if (path.length <= index) {
            return;
        }

        const {key, mode} = path[index];
        
        if (!mode) {
            if (key == null) {
                if (index+1 !== path.length) {
                    throw new Error(`Not allowed '${FilterTokens.NOT}${FilterTokens.ALL}' as a non terminal`);
                }
                
                if (node.fallback === undefined) {
                    node.fallback = false;
                }

                if (node.fallback !== false) {
                    throw new Error("Cannot define tha same path twice!");
                }    
                return;
            }

            if (node.children.has(key) && node.children.get(key) !== false) {
                throw new Error("Cannot define tha same path twice!");
            }
            node.children.set(key, false);

            if (node.fallback === undefined) {
                if (index+1 === path.length) {
                    node.fallback = true;
                    return;
                }

                const next = {
                    children: new Map<KeyType, PathNode | boolean>(),
                };
                this.addSubPath(next, path, index+1);
                node.fallback = next; 
                
                return;
            }

            if (typeof node.fallback === 'boolean') {
                if (node.fallback === false || index+1 !== path.length) {
                    throw new Error("Cannot define tha same path twice!");
                }
                return;
            }
            
            this.addSubPath(node.fallback, path, index+1);
            return;
        }

        if (key === null) {
            if (node.fallback === undefined) {
                if (index+1 === path.length) {
                    node.fallback = true;
                    return; 
                }

                const next = {
                    children: new Map<KeyType, PathNode | boolean>(),
                };
                this.addSubPath(next, path, index+1);
                node.fallback = next; 
                return;
            }
            
            if (typeof node.fallback === 'boolean') {
                if (node.fallback === false || index+1 !== path.length) {
                    throw new Error("Cannot define tha same path twice!");
                }
                return;
            }

            this.addSubPath(node.fallback, path, index+1);
            return;
        }

        if ( !node.children.has(key) ) {
            if (index+1 === path.length) {
                node.children.set(key, true);
                return;
            }

            const next = {
                children: new Map<KeyType, PathNode | boolean>(),
            };
            this.addSubPath(next, path, index+1);
            node.children.set(key, next);
            return;
        }

        const value = node.children.get(key);

        if (typeof value === 'boolean') {
            if (value === false || index+1 !== path.length) {
                throw new Error("Cannot define tha same path twice!");
            }
        }

        this.addSubPath(node.children.get(key) as PathNode, path, index+1);
    }    

    private parseKeys(str: string): Array<DepthType> {
        const answer: Array<DepthType> = [];
        
        if ( str.startsWith(FilterTokens.SEPARATOR) ) {
            throw new Error("Syntax error: Should start with a field");
        }

        let mode = true;
        if ( str.startsWith(FilterTokens.NOT) ){
            str = str.substring(FilterTokens.NOT.length);
            mode = false;
        } 
        while (0 < str.length) {
            // remove spaces
            let size = 0;
            while (true) {
                if (str.substring(size,size + FilterTokens.SPACE.length) !== FilterTokens.SPACE) {
                    break;
                }
                size += FilterTokens.SPACE.length;
            }
            if (0 < size) {
                str = str.substring(size);
                continue;
            }

            //should not start with separator
            if ( str.startsWith(FilterTokens.SEPARATOR) ) {
                str = str.substring(FilterTokens.SEPARATOR.length);
                continue;
            }

            if ( str.startsWith(FilterTokens.ALL) ) {
                str = str.substring(FilterTokens.ALL.length);
                answer.push({key: null, mode});
                continue;
            }

            const rangeRegex = /(0|[1-9][0-9]*)\:(0|[1-9][0-9]*)/;
            const [range] = str.match(rangeRegex) ?? [];
            if ( range !== undefined && str.startsWith(range) ){
                str = str.substring(range.length);
                const [bg, ed] = range.split(':').map( num => Number(num) );
                if (ed < bg) {
                    throw new Error(`Syntax error: tha range '${range}' is not valid, ${bg} > than ${ed}`);
                }
                for (let key = bg; key <= ed; key++) {
                    answer.push({key, mode});
                }
                continue;
            }

            const numberRegex = /0|[1-9][0-9]*/;
            const [num] = str.match(numberRegex) ?? [];
            if ( num !== undefined && str.startsWith(num) ){
                str = str.substring(num.length);
                answer.push({key: JSON.parse(num), mode});
                continue;
            }

            let strSize = this.getString(str);
            if (0 < strSize) {
                const value = str.substring(0, strSize);
                str = str.substring(strSize);
                answer.push({key: JSON.parse(`"${value}"`), mode});
                continue;
            }

            strSize = this.getStringQuotes(str, FilterTokens.SINGLE_QUOTES);
            if (0 < strSize) {
                const value = str.substring(0, strSize);
                str = str.substring(strSize);
                answer.push({key: JSON.parse(value), mode});
                continue;
            }

            strSize = this.getStringQuotes(str, FilterTokens.DOUBLE_QUOTES);
            if (0 < strSize) {
                const value = str.substring(0, strSize);
                str = str.substring(strSize);
                answer.push({key: JSON.parse(value), mode});
                continue;
            }

            break;
        }

        if (str.length !== 0) {
            throw new Error("Syntax error: Characters not permitted!");
        }

        if (answer.length === 0) {
            throw new Error("Syntax error: No tokens!");
        }

        for (const token of answer) {
            if (token.key === FilterTokens.ALL) {
                if (1 < answer.length) {
                    throw new Error(`Syntax error: The token '${FilterTokens.ALL}' should be used alone`);
                } else {
                    break;
                }
            }
        }

        return answer;
    }

    private buildPaths (
        keys: Array<DepthType>[],
        index: number, 
        answer: Array<DepthType>[],
        aux: Array<DepthType>
    ) {
        if (index === keys.length) {
            answer.push( Array.from(aux) );
            return;
        }

        for (const key of keys[index]) {
            aux.push(key);
            this.buildPaths(keys, index+1, answer, aux);
            aux.pop();
        }
    }

    private generatePaths (path: string): Array<DepthType>[] {
        if ( path.startsWith(FilterTokens.DEPTH_SEPARATOR) ) {
            path = path.substring(FilterTokens.DEPTH_SEPARATOR.length); 
        }

        if ( path.endsWith(FilterTokens.DEPTH_SEPARATOR) ) {
            path = path.substring(0, path.length - FilterTokens.DEPTH_SEPARATOR.length);
        }

        const keys = path.split(FilterTokens.DEPTH_SEPARATOR)
            .map( level => this.parseKeys(level) );

        const answer: Array<DepthType>[] = [];
        const aux: Array<DepthType> = [];
        this.buildPaths(keys, 0, answer, aux)

        return answer;
    }

    private getStringQuotes (str: string, token: FilterTokens): number {
        if ( !str.startsWith(token) ) {
            return 0;
        }
        
        let size = JSONTokens.STRING_OPEN.length;
        while (size < str.length) {
            let c = str.substring(size,size+1);
            switch (c) {
                case token:
                    size += FilterTokens.SINGLE_QUOTES.length;
                    return size;
                case JSONTokens.BACKSLASH:
                    if (str.length < size + 2) {
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

    private getString (str: string): number {
        let size = 0;
        while (size < str.length) {
            let c = str.substring(size,size+1);
            switch (c) {
                case FilterTokens.SPACE:
                case FilterTokens.SEPARATOR:
                    return size;
                default:
                    size += 1;
                    break;
            }
        }

        return size;
    }
    
    filter(messages: Message[]): Message[] {
        const output: Message[] = [];
        for (const message of messages) {
            if ( !this.search(this.root, message.path) ) {
                continue;
            }
            output.push(message);
        }

        return output;
    }

    private search (node: PathNode, path: Array<KeyType>, index: number = 0): boolean {
        if (path.length <= index) {
            return true;
        }

        const key = path[index];
        if ( !node.children.has(key) ) {
            if (node.fallback === undefined) {
                return false;
            }

            if (typeof node.fallback === 'boolean') {
                return node.fallback;
            }

            return this.search(node.fallback, path, index+1);
        }

        const value = node.children.get(key);
            
        if (typeof value === 'boolean') {
            return value as boolean;
        }

        return this.search(value as PathNode, path, index+1);
    }
}

export class JSONFilterTransform extends Transform {
    private broker: JSONFilterBroker;

    constructor(pathSelector: string[], opts?: TransformOptions) {
        super(opts);
        this.broker = new JSONFilterBroker(pathSelector);
    }

    _transform(chunk: string, _: BufferEncoding, callback: TransformCallback): void {
        
        const input: Message[] = JSON.parse(chunk);
        const output = this.broker.filter(input);
        
        callback( null, JSON.stringify(output, null, 0) );
    }
}