'use client';
import ProcessDiagram from './ProcessDiagram';
import type { DiagramProps } from './shared';

/** Flowcharts share the process layout; decision elements are drawn dashed and edge labels name each branch. */
export default function FlowchartDiagram(props: DiagramProps) {
  return <ProcessDiagram {...props} variant="flowchart" />;
}
