/**
 * @fileoverview Advanced React hook for managing lead operations with real-time updates,
 * AI-driven scoring, and optimized performance
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { ILead, LeadStatus } from '../types/lead';
import { LeadService } from '../services/lead.service';
import { hasPermission } from '../lib/auth';
import { UserRole } from '../types/auth';

// WebSocket connection status enum
enum WebSocketStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}

// Cache configuration interface
interface CacheOptions {
  enabled: boolean;
  ttl: number;
  updateOnChange: boolean;
}

// Lead filtering interface
interface LeadFilters {
  status?: LeadStatus[];
  scoreRange?: {
    min: number;
    max: number;
  };
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// Batch operations interface
interface BatchOperations {
  selectedLeads: Set<string>;
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelection: (leadId: string) => void;
  updateSelected: (updates: Partial<ILead>) => Promise<void>;
  deleteSelected: () => Promise<void>;
}

// Hook return interface
interface UseLeadsReturn {
  leads: ILead[];
  loading: boolean;
  error: string | null;
  selectedLead: ILead | null;
  totalLeads: number;
  batchOperations: BatchOperations;
  realTimeStatus: WebSocketStatus;
  cacheStatus: {
    enabled: boolean;
    lastUpdated: Date | null;
  };
  refresh: () => Promise<void>;
  setFilters: (filters: LeadFilters) => void;
  selectLead: (lead: ILead | null) => void;
  updateLead: (leadId: string, updates: Partial<ILead>) => Promise<void>;
  deleteLead: (leadId: string) => Promise<void>;
  updateAIScore: (leadId: string) => Promise<void>;
}

/**
 * Advanced hook for managing leads with real-time updates, caching, and batch operations
 */
export function useLeads(
  initialFilters?: LeadFilters,
  cacheOptions: CacheOptions = { enabled: true, ttl: 300000, updateOnChange: true }
): UseLeadsReturn {
  const dispatch = useDispatch();
  const leadService = useRef(new LeadService());
  
  // State management
  const [leads, setLeads] = useState<ILead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ILead | null>(null);
  const [filters, setFilters] = useState<LeadFilters>(initialFilters || {});
  const [totalLeads, setTotalLeads] = useState(0);
  const [realTimeStatus, setRealTimeStatus] = useState<WebSocketStatus>(WebSocketStatus.CONNECTING);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [lastCacheUpdate, setLastCacheUpdate] = useState<Date | null>(null);

  // Permission checks
  const canManageLeads = hasPermission(UserRole.MANAGER);
  const canUpdateScores = hasPermission(UserRole.ANALYST);

  /**
   * Fetch leads with error handling and caching
   */
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const { data, total, aiInsights } = await leadService.current.getLeadsWithAIScore(
        filters,
        { page: 1, limit: 50 },
        cacheOptions.enabled
      );
      
      setLeads(data);
      setTotalLeads(total);
      setLastCacheUpdate(new Date());
      
      // Dispatch AI insights to store if available
      if (aiInsights) {
        dispatch({ type: 'leads/setAIInsights', payload: aiInsights });
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, cacheOptions.enabled, dispatch]);

  /**
   * Setup real-time updates subscription
   */
  useEffect(() => {
    const subscription = leadService.current.getLeadUpdates().subscribe({
      next: (updatedLeads) => {
        setLeads(current => {
          const updatedList = [...current];
          updatedLeads.forEach(updatedLead => {
            const index = updatedList.findIndex(l => l.id === updatedLead.id);
            if (index !== -1) {
              updatedList[index] = updatedLead;
            } else {
              updatedList.push(updatedLead);
            }
          });
          return updatedList;
        });
        setRealTimeStatus(WebSocketStatus.CONNECTED);
      },
      error: (err) => {
        setRealTimeStatus(WebSocketStatus.ERROR);
        console.error('Real-time update error:', err);
      }
    });

    return () => {
      subscription.unsubscribe();
      setRealTimeStatus(WebSocketStatus.DISCONNECTED);
    };
  }, []);

  /**
   * Batch operations implementation
   */
  const batchOperations: BatchOperations = {
    selectedLeads,
    selectAll: () => {
      setSelectedLeads(new Set(leads.map(lead => lead.id)));
    },
    deselectAll: () => {
      setSelectedLeads(new Set());
    },
    toggleSelection: (leadId: string) => {
      setSelectedLeads(current => {
        const updated = new Set(current);
        if (updated.has(leadId)) {
          updated.delete(leadId);
        } else {
          updated.add(leadId);
        }
        return updated;
      });
    },
    updateSelected: async (updates: Partial<ILead>) => {
      if (!canManageLeads) throw new Error('Insufficient permissions');
      
      const selectedArray = Array.from(selectedLeads);
      const result = await leadService.current.batchUpdateLeads(
        selectedArray.map(id => ({ id, ...updates })),
        { refreshCache: true, notifyUpdates: true }
      );

      if (!result.success) {
        throw new Error(`Batch update failed: ${Object.values(result.errors).join(', ')}`);
      }

      await fetchLeads();
    },
    deleteSelected: async () => {
      if (!canManageLeads) throw new Error('Insufficient permissions');
      
      const selectedArray = Array.from(selectedLeads);
      await leadService.current.batchUpdateLeads(
        selectedArray.map(id => ({ id, status: LeadStatus.LOST })),
        { refreshCache: true, notifyUpdates: true }
      );

      setSelectedLeads(new Set());
      await fetchLeads();
    }
  };

  /**
   * Individual lead operations
   */
  const updateLead = async (leadId: string, updates: Partial<ILead>): Promise<void> => {
    if (!canManageLeads) throw new Error('Insufficient permissions');
    
    try {
      await leadService.current.batchUpdateLeads(
        [{ id: leadId, ...updates }],
        { refreshCache: true, notifyUpdates: true }
      );
      
      if (selectedLead?.id === leadId) {
        setSelectedLead(prev => prev ? { ...prev, ...updates } : null);
      }
      
      await fetchLeads();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const updateAIScore = async (leadId: string): Promise<void> => {
    if (!canUpdateScores) throw new Error('Insufficient permissions');
    
    try {
      const updatedScore = await leadService.current.updateAIScore(leadId);
      await fetchLeads();
      return updatedScore;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  return {
    leads,
    loading,
    error,
    selectedLead,
    totalLeads,
    batchOperations,
    realTimeStatus,
    cacheStatus: {
      enabled: cacheOptions.enabled,
      lastUpdated: lastCacheUpdate
    },
    refresh: fetchLeads,
    setFilters: (newFilters: LeadFilters) => setFilters(newFilters),
    selectLead: setSelectedLead,
    updateLead,
    deleteLead: (leadId: string) => updateLead(leadId, { status: LeadStatus.LOST }),
    updateAIScore
  };
}