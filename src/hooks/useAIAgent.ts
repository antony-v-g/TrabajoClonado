import { useState, useCallback } from 'react';
import AIAgentService, {
  RouteAnalysisResponse,
  RouteRecommendation,
  RiskAssessment,
} from '../services/aiAgentService';

interface UseAIAgentState {
  loading: boolean;
  error: string | null;
  data: unknown | null;
}

/**
 * Hook personalizado para interactuar con el Agente IA
 */
export const useAIAgent = () => {
  const [state, setState] = useState<UseAIAgentState>({
    loading: false,
    error: null,
    data: null,
  });

  const setLoading = (loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  };

  const setError = (error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  };

  const setData = (data: unknown) => {
    setState((prev) => ({ ...prev, data }));
  };

  /**
   * Analiza la seguridad de una ruta
   */
  const analyzeRoute = useCallback(
    async (
      origin: string,
      destination: string,
      contextData?: Record<string, unknown>
    ): Promise<RouteAnalysisResponse | null> => {
      try {
        setLoading(true);
        setError(null);

        const result = await AIAgentService.analyzeRoute(
          origin,
          destination,
          contextData
        );

        setData(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Obtiene recomendaciones de ruta
   */
  const getRecommendations = useCallback(
    async (
      startPoint: string,
      endPoint: string,
      timeOfDay?: string,
      additionalContext?: Record<string, unknown>
    ): Promise<RouteRecommendation[] | null> => {
      try {
        setLoading(true);
        setError(null);

        const result = await AIAgentService.getRouteRecommendations(
          startPoint,
          endPoint,
          timeOfDay,
          additionalContext
        );

        setData(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Evalúa el riesgo de una ubicación
   */
  const assessRisk = useCallback(
    async (
      latitude: number,
      longitude: number,
      timeOfDay?: string
    ): Promise<RiskAssessment | null> => {
      try {
        setLoading(true);
        setError(null);

        const result = await AIAgentService.assessLocationRisk(
          latitude,
          longitude,
          timeOfDay
        );

        setData(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Procesa una consulta
   */
  const queryAI = useCallback(
    async (
      query: string,
      conversationHistory?: Array<[string, string]>
    ): Promise<string | null> => {
      try {
        setLoading(true);
        setError(null);

        const result = await AIAgentService.processQuery(query, conversationHistory);

        setData(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading: state.loading,
    error: state.error,
    data: state.data,
    analyzeRoute,
    getRecommendations,
    assessRisk,
    queryAI,
  };
};

export default useAIAgent;
