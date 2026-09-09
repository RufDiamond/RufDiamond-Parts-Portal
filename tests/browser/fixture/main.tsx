import { createRoot } from "react-dom/client";
import { useState } from "react";
import { DrawingViewer, ZOOM_STEPS } from "@/components/DrawingViewer";
import { PartsTable } from "@/components/PartsTable";
import { useDiagramSelection } from "@/state/useDiagramSelection";
import type { FigurePartRow } from "@/types/catalog";
import "@/app/globals.css";

const canvas = document.createElement("canvas");
canvas.width = 400; canvas.height = 1000;
const context = canvas.getContext("2d")!;
context.fillStyle = "white"; context.fillRect(0,0,400,1000);
context.strokeRect(40,800,40,100); context.strokeRect(280,100,40,100);
const src = canvas.toDataURL("image/png");
const rows: FigurePartRow[] = Array.from({ length:40 }, (_, index) => ({
  figurePart:{ id:`row-${index}`, figureId:"tall", partId:`part-${index}`, qty:1, remarks:null, serviceable:true },
  part:{ id:`part-${index}`, partNumber:`P-${index}`, description:`Synthetic component ${index}`, currency:"CAD", listPrice:1,
    manufacturer:null, supersededByPartId:null, requires:[], status:"active" },
  calloutNumbers:[index + 1],
}));
const doc = { imageWidth:400, imageHeight:1000, occurrences:[
  { calloutId:"c0", figurePartId:"row-39", partId:"part-39", partNumber:"P-39", refNo:"40", regions:[{ id:"r0", outer:[[40,800],[80,800],[80,900],[40,900]] as [number,number][], holes:[] }] },
  { calloutId:"c1", figurePartId:"row-0", partId:"part-0", partNumber:"P-0", refNo:"1", regions:[{ id:"r1", outer:[[280,100],[320,100],[320,200],[280,200]] as [number,number][], holes:[] }] },
  { calloutId:"c2", figurePartId:"row-1", partId:"part-1", partNumber:"P-1", refNo:"2", regions:[{ id:"r2", outer:[[10,10],[390,10],[390,990],[10,990]] as [number,number][], holes:[] }] },
] };
function App() {
  const focus = useDiagramSelection({ figureId:"tall", releaseKey:"synthetic", rows });
  const [zoom, setZoom] = useState(1);
  const [request, setRequest] = useState(0);
  return <><h1>Isolated synthetic tall PNG (not catalogue content)</h1>
    <button onClick={() => setZoom(ZOOM_STEPS[Math.min(4, ZOOM_STEPS.indexOf(zoom)+1)])}>Zoom in</button>
    <button onClick={() => setZoom(ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(zoom)-1)])}>Zoom out</button>
    <button onClick={() => setRequest((n) => n+1)}>Show selected part</button><button onClick={focus.clear}>Clear selection</button>
    <div style={{ display:"grid", gridTemplateColumns:"500px 600px", height:500 }}>
      <DrawingViewer label="Synthetic tall PNG" src={src} width={400} height={1000} document={doc}
        markers={[{ id:"c0", number:40, partId:"part-39", figurePartId:"row-39", x:15, y:85 }]}
        selectedPartIds={focus.selectedPartIds} onSelectPart={focus.selectPart} selectionActivation={focus.activation} revealRequest={request}
        zoom={zoom} onZoomChange={setZoom} />
      <PartsTable rows={rows} selectedPartIds={focus.selectedPartIds} onSelectPart={focus.selectPart}
        selectedFigurePartId={focus.selection?.figurePartId} selectionActivation={focus.activation} />
    </div></>;
}
createRoot(document.getElementById("root")!).render(<App />);
