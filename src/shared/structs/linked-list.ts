class LinkedListNode<T> {
    value: T;
    next: LinkedListNode<T> | undefined;

    constructor(value: T) {
        this.value = value;
        this.next = undefined;
    }
}

export class LinkedList<T> {
    private first: LinkedListNode<T> | undefined;
    private last: LinkedListNode<T> | undefined;

    constructor() {
        this.first = undefined;
        this.last = undefined;
    }

    push(value: T) {
        const node = new LinkedListNode(value);

        if (this.first === undefined) {
            this.first = this.last = node;
            return;
        }

        if (this.last === undefined) {
            throw new Error("LinkedList.last is undefined, but shouldn't");
        }

        this.last.next = node;
        this.last = node;
    }

    pop(): T | undefined {
        const value = this.top();
        if (this.first !== undefined) {
            this.first = this.first.next;
        }
        return value;
    }

    top(): T | undefined {
        if (this.first === undefined) {
            return undefined;
        }
        const {value} = this.first;
        return value;
    }
}