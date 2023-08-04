class StackNode<T> {
    value: T;
    prev: StackNode<T> | undefined;

    constructor(value: T) {
        this.value = value;
        this.prev = undefined;
    }
}

export class Stack<T> {
    last: StackNode<T> | undefined;

    constructor() {
        this.last = undefined;
    }

    push(value: T) {
        const node = new StackNode(value);

        if (this.last === undefined) {
            this.last = node;
        }

        node.prev = this.last;
        this.last = node;
    }

    pop(): T | undefined {
        const value = this.top();
        if (this.last !== undefined) {
            this.last = this.last.prev;
        }
        return value;
    }

    top(): T | undefined {
        if (this.last === undefined) {
            return undefined;
        }
        const {value} = this.last;
        return value;
    }
}