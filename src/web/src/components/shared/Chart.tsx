import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import clsx from 'clsx';
import { IChartData, MetricType, ThresholdConfig } from '../../types/analytics';

// Register Chart.js components
ChartJS.register(...registerables);

// Constants for chart configuration
const CHART_DEFAULTS = {
  HEIGHT: 300,
  WIDTH: '100%',
  REFRESH_INTERVAL: 30000,
  ANIMATION_DURATION: 750,
  FONT_FAMILY: 'Inter, sans-serif',
  COLORS: {
    PRIMARY: '#2563EB',
    SECONDARY: '#3B82F6',
    SUCCESS: '#059669',
    WARNING: '#FBBF24',
    ERROR: '#DC2626',
    GRID: '#E5E7EB',
    TARGET_LINE: '#9333EA',
    THRESHOLD_CRITICAL: '#991B1B',
    THRESHOLD_WARNING: '#B45309',
    THRESHOLD_NORMAL: '#047857'
  },
  THRESHOLD_DEFAULTS: {
    WARNING_THRESHOLD: 0.8,
    CRITICAL_THRESHOLD: 0.95
  }
};

interface ChartProps {
  data: IChartData;
  type: 'line' | 'bar' | 'area' | 'pie';
  height?: number;
  width?: number | string;
  className?: string;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showTargetLine?: boolean;
  targetValue?: number;
  thresholds?: ThresholdConfig;
  onDataPointClick?: (point: any) => void;
  refreshInterval?: number;
  animationDuration?: number;
  tooltipFormat?: (value: number) => string;
  accessibilityLabel?: string;
}

const formatChartData = (
  data: IChartData,
  thresholds?: ThresholdConfig,
  targetValue?: number
) => {
  const formattedData = {
    labels: data.labels,
    datasets: data.datasets.map(dataset => ({
      ...dataset,
      borderColor: dataset.color || CHART_DEFAULTS.COLORS.PRIMARY,
      backgroundColor: dataset.color ? `${dataset.color}20` : `${CHART_DEFAULTS.COLORS.PRIMARY}20`,
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6
    }))
  };

  if (targetValue && targetValue > 0) {
    formattedData.datasets.push({
      label: 'Target',
      data: new Array(data.labels.length).fill(targetValue),
      borderColor: CHART_DEFAULTS.COLORS.TARGET_LINE,
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      fill: false
    });
  }

  if (thresholds) {
    const thresholdDatasets = Object.entries(thresholds).map(([level, value]) => ({
      label: `${level} Threshold`,
      data: new Array(data.labels.length).fill(value),
      borderColor: level === 'critical' 
        ? CHART_DEFAULTS.COLORS.THRESHOLD_CRITICAL 
        : CHART_DEFAULTS.COLORS.THRESHOLD_WARNING,
      borderDash: [3, 3],
      borderWidth: 1,
      pointRadius: 0,
      fill: false
    }));
    formattedData.datasets.push(...thresholdDatasets);
  }

  return formattedData;
};

const getChartOptions = (props: ChartProps, thresholds?: ThresholdConfig) => {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: props.animationDuration || CHART_DEFAULTS.ANIMATION_DURATION,
      easing: 'easeInOutQuart'
    },
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: {
        display: props.showLegend,
        position: 'top' as const,
        labels: {
          font: {
            family: CHART_DEFAULTS.FONT_FAMILY
          }
        }
      },
      tooltip: {
        enabled: props.showTooltip,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: {
          family: CHART_DEFAULTS.FONT_FAMILY
        },
        bodyFont: {
          family: CHART_DEFAULTS.FONT_FAMILY
        },
        callbacks: {
          label: (context: any) => {
            const value = context.raw;
            return props.tooltipFormat ? props.tooltipFormat(value) : value.toLocaleString();
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: props.showGrid,
          color: CHART_DEFAULTS.COLORS.GRID
        },
        ticks: {
          font: {
            family: CHART_DEFAULTS.FONT_FAMILY
          }
        }
      },
      y: {
        grid: {
          display: props.showGrid,
          color: CHART_DEFAULTS.COLORS.GRID
        },
        ticks: {
          font: {
            family: CHART_DEFAULTS.FONT_FAMILY
          }
        },
        beginAtZero: true
      }
    }
  };

  return options;
};

export const Chart: React.FC<ChartProps> = ({
  data,
  type,
  height = CHART_DEFAULTS.HEIGHT,
  width = CHART_DEFAULTS.WIDTH,
  className,
  showLegend = true,
  showGrid = true,
  showTooltip = true,
  showTargetLine = false,
  targetValue,
  thresholds,
  onDataPointClick,
  refreshInterval = CHART_DEFAULTS.REFRESH_INTERVAL,
  animationDuration = CHART_DEFAULTS.ANIMATION_DURATION,
  tooltipFormat,
  accessibilityLabel
}) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<ChartJS | null>(null);
  const refreshTimerId = useRef<number | null>(null);

  const formattedData = useMemo(() => 
    formatChartData(data, thresholds, showTargetLine ? targetValue : undefined),
    [data, thresholds, showTargetLine, targetValue]
  );

  const chartOptions = useMemo(() => 
    getChartOptions({
      type,
      showLegend,
      showGrid,
      showTooltip,
      animationDuration,
      tooltipFormat
    }, thresholds),
    [type, showLegend, showGrid, showTooltip, animationDuration, tooltipFormat, thresholds]
  );

  const handleClick = useCallback((event: any) => {
    if (!chartInstance.current || !onDataPointClick) return;

    const elements = chartInstance.current.getElementsAtEventForMode(
      event,
      'nearest',
      { intersect: true },
      false
    );

    if (elements.length > 0) {
      const dataPoint = {
        label: data.labels[elements[0].index],
        value: data.datasets[elements[0].datasetIndex].data[elements[0].index],
        datasetLabel: data.datasets[elements[0].datasetIndex].label
      };
      onDataPointClick(dataPoint);
    }
  }, [data, onDataPointClick]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    chartInstance.current = new ChartJS(chartRef.current, {
      type: type === 'area' ? 'line' : type,
      data: formattedData,
      options: chartOptions
    });

    if (onDataPointClick) {
      chartRef.current.onclick = handleClick;
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [type, formattedData, chartOptions, handleClick, onDataPointClick]);

  useEffect(() => {
    if (refreshInterval > 0) {
      refreshTimerId.current = window.setInterval(() => {
        if (chartInstance.current) {
          chartInstance.current.update();
        }
      }, refreshInterval);

      return () => {
        if (refreshTimerId.current) {
          clearInterval(refreshTimerId.current);
        }
      };
    }
  }, [refreshInterval]);

  return (
    <div 
      className={clsx('chart-container', className)}
      style={{ height, width }}
      role="img"
      aria-label={accessibilityLabel || 'Chart visualization'}
    >
      <canvas ref={chartRef} />
    </div>
  );
};

export default Chart;