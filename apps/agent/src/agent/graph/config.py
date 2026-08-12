from enum import Enum


class Node(str, Enum):
    MAIN = "main"


class Model(str, Enum):
    GEMMA4_27B = "gemma4-27b-a4b-it"


class Chain(str, Enum):
    MAIN = "main"
