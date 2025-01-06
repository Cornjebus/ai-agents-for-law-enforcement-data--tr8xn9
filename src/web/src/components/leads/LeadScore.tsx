import React, { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ErrorBoundary } from 'react-error-boundary';
import { ILead } from '../../types/lead';
import Card from '../shared/Card';
import Chart from '../shared/Chart';
import { DESIGN_SYSTEM } from '../../lib/constants';

interface LeadScoreProps {
  lead: ILead;
  showTrend?: boolean;
  className?: string;
  onScoreClick?: (score: number) => void;
  refreshInterval?: number;
  tooltipContent?: React.ReactNode;
  onScoreHover?: (score: number) => void;
  thresholds?: {
    low: number;
    medium: number;
    high: number;
  };
  accessibilityLabel?: string;
}

const defaultThresholds = {
  low: 30,
  medium: 60,
  high: 90,
};

const getScoreColor = (score: number, thresholds = defaultThresholds): string => {
  if (score < 0 || score > 100) return 'text-gray-400';
  
  if (score >= thresholds.high) {
    return 'text-emerald-600 dark:text-emerald-500';
  } else if (score >= thresholds.medium) {
    return 'text-blue-600 dark:text-blue-500';
  } else if (score >= thresholds.low) {
    return 'text-amber-600 dark:text-amber-500';
  }
  return 'text-red-600 dark:text-red-500';
};

const formatScoreData = (interactions: ILead['interactions'], includePrediction = false) => {
  const scoreData = interactions
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(interaction => ({
      x: interaction.timestamp,
      y: interaction.sentiment || 0
    }));

  const datasets = [
    {
      label: 'Lead Score',
      data: scoreData,
      color: DESIGN_SYSTEM.COLORS.primary,
      borderDash: []
    }
  ];

  if (includePrediction && scoreData.length > 0) {
    const lastScore = scoreData[scoreData.length - 1].y;
    const predictedScore = Math.min(100, lastScore * 1.1); // Simple prediction
    datasets.push({
      label: 'Predicted',
      data: [{ x: new Date(), y: predictedScore }],
      color: DESIGN_SYSTEM.COLORS.secondary,
      borderDash: [5, 5]
    });
  }

  return {
    labels: scoreData.map(d => new Date(d.x).toLocaleDateString()),
    datasets
  };
};

const getAccessibilityLabel = (score: number, baseLabel?: string): string => {
  const quality = score >= defaultThresholds.high ? 'excellent' :
    score >= defaultThresholds.medium ? 'good' :
    score >= defaultThresholds.low ? 'fair' : 'poor';
    
  return `${baseLabel || 'Lead score'}: ${score} out of 100 - ${quality} quality`;
};

const LeadScore: React.FC<LeadScoreProps> = ({
  lead,
  showTrend = false,
  className,
  onScoreClick,
  refreshInterval = 30000,
  tooltipContent,
  onScoreHover,
  thresholds = defaultThresholds,
  accessibilityLabel
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [currentScore, setCurrentScore] = useState(lead.score);

  const scoreColor = useMemo(() => 
    getScoreColor(currentScore, thresholds),
    [currentScore, thresholds]
  );

  const chartData = useMemo(() => 
    formatScoreData(lead.interactions, showTrend),
    [lead.interactions, showTrend]
  );

  const handleScoreClick = useCallback(() => {
    if (onScoreClick) {
      onScoreClick(currentScore);
    }
  }, [currentScore, onScoreClick]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (onScoreHover) {
      onScoreHover(currentScore);
    }
  }, [currentScore, onScoreHover]);

  useEffect(() => {
    setCurrentScore(lead.score);
  }, [lead.score]);

  useEffect(() => {
    if (refreshInterval > 0) {
      const timer = setInterval(() => {
        setCurrentScore(prevScore => {
          const latestInteraction = lead.interactions[lead.interactions.length - 1];
          return latestInteraction?.sentiment || prevScore;
        });
      }, refreshInterval);

      return () => clearInterval(timer);
    }
  }, [lead.interactions, refreshInterval]);

  return (
    <ErrorBoundary fallback={<div>Error loading lead score</div>}>
      <Card
        variant="interactive"
        className={clsx(
          'transition-all duration-300',
          'hover:shadow-lg',
          className
        )}
        role="region"
        aria-label={getAccessibilityLabel(currentScore, accessibilityLabel)}
      >
        <div className="p-4 space-y-4">
          <div
            className={clsx(
              'flex items-center justify-between',
              'cursor-pointer',
              'transition-opacity duration-200'
            )}
            onClick={handleScoreClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="space-y-1">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Lead Quality Score
              </div>
              <div className={clsx('text-3xl font-bold', scoreColor)}>
                {currentScore}
              </div>
            </div>
            
            {isHovered && tooltipContent && (
              <div className="absolute right-4 top-4 bg-white dark:bg-gray-800 shadow-lg rounded p-2 z-50">
                {tooltipContent}
              </div>
            )}
          </div>

          {showTrend && (
            <div className="h-32">
              <Chart
                data={chartData}
                type="line"
                height={128}
                showLegend={false}
                showGrid={true}
                showTooltip={true}
                thresholds={{
                  warning: thresholds.low,
                  critical: thresholds.medium
                }}
                refreshInterval={refreshInterval}
                accessibilityLabel="Lead score trend chart"
              />
            </div>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400">
            Last updated: {new Date(lead.updatedAt).toLocaleString()}
          </div>
        </div>
      </Card>
    </ErrorBoundary>
  );
};

export default LeadScore;