// Servicio de IA y Agentes - Cliente Frontend
// Uso en React/TypeScript

import axios from 'axios';

interface AgentAnalysisResponse {
  routeDescription: string;
  agentAnalysis: string;
  agentType: string;
  executedAt: string;
}

interface PersonalizedRecommendationsResponse {
  userId: string;
  recommendations: string;
  agentType: string;
  generatedAt: string;
}

interface IncidentAnalysisResponse {
  zone: string;
  analysis: string;
  agentType: string;
  analyzedAt: string;
  dayRange: number;
}

const API_BASE = process.env.VITE_API_URL || 'http://localhost:5000';
const AI_ENDPOINT = `${API_BASE}/api/ai`;

/**
 * Analizar una ruta con el agente inteligente
 */
export const analyzeRouteWithAgent = async (
  routeDescription: string,
  estimatedTime?: string,
  token?: string
): Promise<AgentAnalysisResponse> => {
  try {
    const response = await axios.post(
      `${AI_ENDPOINT}/agent/analyze-route-intelligent`,
      {
        routeDescription,
        estimatedTime: estimatedTime || new Date().toLocaleTimeString('es-ES', { hour12: false })
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error analizando ruta con agente:', error);
    throw error;
  }
};

/**
 * Obtener recomendaciones personalizadas del agente
 */
export const getPersonalizedRecommendations = async (
  context?: string,
  token?: string
): Promise<PersonalizedRecommendationsResponse> => {
  try {
    const response = await axios.post(
      `${AI_ENDPOINT}/agent/personalized-recommendations`,
      { context },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error obteniendo recomendaciones:', error);
    throw error;
  }
};

/**
 * Analizar incidentes en una zona específica
 */
export const analyzeIncidents = async (
  zone: string,
  dayRange?: number,
  token?: string
): Promise<IncidentAnalysisResponse> => {
  try {
    const response = await axios.post(
      `${AI_ENDPOINT}/agent/analyze-incidents`,
      {
        zone,
        dayRange: dayRange || 30
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error analizando incidentes:', error);
    throw error;
  }
};

/**
 * Obtener las capacidades disponibles del agente
 */
export const getAgentCapabilities = async (): Promise<any> => {
  try {
    const response = await axios.get(`${AI_ENDPOINT}/agent/capabilities`);
    return response.data;
  } catch (error) {
    console.error('Error obteniendo capacidades:', error);
    throw error;
  }
};

/**
 * Verificar estado del servicio de IA
 */
export const checkAiHealth = async (): Promise<any> => {
  try {
    const response = await axios.get(`${AI_ENDPOINT}/health`);
    return response.data;
  } catch (error) {
    console.error('Error verificando salud del servicio:', error);
    throw error;
  }
};

// ===============================================
// COMPONENTES REACT DE EJEMPLO
// ===============================================

import React, { useState, useEffect } from 'react';

/**
 * Componente para análisis de ruta con IA
 */
export const AIRouteAnalyzer: React.FC<{ token: string }> = ({ token }) => {
  const [route, setRoute] = useState('');
  const [time, setTime] = useState('12:00');
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await analyzeRouteWithAgent(route, time, token);
      setAnalysis(result.agentAnalysis);
    } catch (err) {
      setError('Error al analizar la ruta: ' + (err as any).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-route-analyzer">
      <h2>Análisis Inteligente de Ruta</h2>

      <input
        type="text"
        placeholder="Descripción de la ruta..."
        value={route}
        onChange={(e) => setRoute(e.target.value)}
        className="input-field"
      />

      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="input-field"
      />

      <button
        onClick={handleAnalyze}
        disabled={loading || !route}
        className="btn-primary"
      >
        {loading ? 'Analizando...' : 'Analizar Ruta'}
      </button>

      {error && <div className="alert alert-error">{error}</div>}

      {analysis && (
        <div className="analysis-result">
          <h3>Análisis del Agente</h3>
          <pre>{analysis}</pre>
        </div>
      )}
    </div>
  );
};

/**
 * Componente para recomendaciones personalizadas
 */
export const AIRecommendations: React.FC<{ token: string; userId: string }> = ({ token, userId }) => {
  const [context, setContext] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGetRecommendations = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getPersonalizedRecommendations(context, token);
      setRecommendations(result.recommendations);
    } catch (err) {
      setError('Error al obtener recomendaciones: ' + (err as any).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-recommendations">
      <h2>Recomendaciones Personalizadas</h2>

      <textarea
        placeholder="Contexto adicional (opcional)..."
        value={context}
        onChange={(e) => setContext(e.target.value)}
        className="textarea-field"
        rows={3}
      />

      <button
        onClick={handleGetRecommendations}
        disabled={loading}
        className="btn-primary"
      >
        {loading ? 'Generando...' : 'Obtener Recomendaciones'}
      </button>

      {error && <div className="alert alert-error">{error}</div>}

      {recommendations && (
        <div className="recommendations-result">
          <h3>Tu Plan de Seguridad Personalizado</h3>
          <pre>{recommendations}</pre>
        </div>
      )}
    </div>
  );
};

/**
 * Componente para análisis de incidentes
 */
export const AIIncidentAnalyzer: React.FC<{ token: string }> = ({ token }) => {
  const [zone, setZone] = useState('');
  const [dayRange, setDayRange] = useState(30);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyzeIncidents = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await analyzeIncidents(zone, dayRange, token);
      setAnalysis(result.analysis);
    } catch (err) {
      setError('Error al analizar incidentes: ' + (err as any).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-incident-analyzer">
      <h2>Análisis de Incidentes por Zona</h2>

      <input
        type="text"
        placeholder="Zona o área..."
        value={zone}
        onChange={(e) => setZone(e.target.value)}
        className="input-field"
      />

      <input
        type="number"
        placeholder="Rango de días"
        value={dayRange}
        onChange={(e) => setDayRange(parseInt(e.target.value))}
        className="input-field"
        min={1}
        max={365}
      />

      <button
        onClick={handleAnalyzeIncidents}
        disabled={loading || !zone}
        className="btn-primary"
      >
        {loading ? 'Analizando...' : 'Analizar Zona'}
      </button>

      {error && <div className="alert alert-error">{error}</div>}

      {analysis && (
        <div className="analysis-result">
          <h3>Análisis de Incidentes</h3>
          <pre>{analysis}</pre>
        </div>
      )}
    </div>
  );
};

// ===============================================
// USO EN COMPONENTE PRINCIPAL
// ===============================================

export const AIPage: React.FC = () => {
  const token = localStorage.getItem('auth_token') || '';
  const userId = localStorage.getItem('user_id') || '';
  const [activeTab, setActiveTab] = useState('route-analysis');

  return (
    <div className="ai-page">
      <h1>Centro de Análisis Inteligente</h1>

      <div className="tabs">
        <button
          className={activeTab === 'route-analysis' ? 'active' : ''}
          onClick={() => setActiveTab('route-analysis')}
        >
          Análisis de Rutas
        </button>
        <button
          className={activeTab === 'recommendations' ? 'active' : ''}
          onClick={() => setActiveTab('recommendations')}
        >
          Recomendaciones
        </button>
        <button
          className={activeTab === 'incidents' ? 'active' : ''}
          onClick={() => setActiveTab('incidents')}
        >
          Análisis de Incidentes
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'route-analysis' && <AIRouteAnalyzer token={token} />}
        {activeTab === 'recommendations' && <AIRecommendations token={token} userId={userId} />}
        {activeTab === 'incidents' && <AIIncidentAnalyzer token={token} />}
      </div>
    </div>
  );
};

export default AIPage;
