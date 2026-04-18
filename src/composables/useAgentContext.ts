import { useTabStore } from '../store/tabStore';
import {
  DatabaseType,
  type ElasticsearchConnection,
  type DynamoDBConnection,
} from '../store/connectionStore';

export const useAgentContext = () => {
  const getContextString = () => {
    const tabStore = useTabStore();
    const activePanel = tabStore.activePanel;
    const activeConnection = activePanel?.connection;
    const activeContent = activePanel?.content || '';

    let context = '';

    if (activeConnection) {
      context += `database context:\n- database: ${activeConnection.type}\n`;
      if (activeConnection.type === DatabaseType.ELASTICSEARCH) {
        const index = (activeConnection as ElasticsearchConnection)?.activeIndex;
        if (index) {
          context += `- indexName: ${index.index}\n- indexMapping: ${index.mapping}\n`;
        }
      } else if (activeConnection.type === DatabaseType.DYNAMODB) {
        const dynamo = activeConnection as DynamoDBConnection;
        context += `- region: ${dynamo.region}\n`;
        if (dynamo.tableName) {
          context += `- table: ${dynamo.tableName}\n`;
        }
      }
    }

    if (activeContent) {
      context += `\ncurrent editor content:\n${activeContent}\n`;
    }

    return context.trim();
  };

  const buildPromptWithContext = (content: string, defaultPrompt: string) => {
    const context = getContextString();
    return `${defaultPrompt}\n\n${context}\n\nuser's question: ${content}`;
  };

  return { getContextString, buildPromptWithContext };
};
