#!/bin/bash

TODO_FILE="$HOME/syncthing/Notes/todo.txt"

if [ ! -f "$TODO_FILE" ]; then
    echo "No todo file found." >&2
    exit 0
fi

if [ ! -s "$TODO_FILE" ]; then
    echo "Todo list is empty."
    exit 0
fi

echo "Todo List (most recent 15):"
echo "----------------"
head -n 15 "$TODO_FILE" | nl -w 2 -s ': '