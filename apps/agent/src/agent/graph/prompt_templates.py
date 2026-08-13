from agent.graph import prompts
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

### main ###
main = ChatPromptTemplate.from_messages(
    [
        ("system", prompts.main.instruction),
        MessagesPlaceholder(variable_name="messages"),
    ]
)

create_document = ChatPromptTemplate.from_messages(
    [
        ("system", prompts.create_document.instruction),
        MessagesPlaceholder(variable_name="messages"),
    ]
)
