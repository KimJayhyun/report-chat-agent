from agent.graph import prompts
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

### main ###
main = ChatPromptTemplate.from_messages(
    [
        ("system", prompts.main.instruction),
        MessagesPlaceholder(variable_name="messages"),
    ]
)

create_report = ChatPromptTemplate.from_messages(
    [
        ("system", prompts.create_report.instruction),
        MessagesPlaceholder(variable_name="messages"),
    ]
)
