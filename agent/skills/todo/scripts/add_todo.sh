#!/bin/bash

if [ $# -eq 0 ]; then
    echo "Error: No todo item provided" >&2
    echo "Usage: $0 \"Todo item here\"" >&2
    exit 1
fi

TODO_FILE="$HOME/syncthing/Notes/todo.txt"

if [ ! -f "$TODO_FILE" ]; then
    echo "No todo file found." >&2
    exit 0
fi

# add to beginning of file
echo "$*" | cat - "$TODO_FILE" > temp && mv temp "$TODO_FILE"

echo "Added todo to todo list"
