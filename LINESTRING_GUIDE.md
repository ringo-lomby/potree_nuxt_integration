# LineString Tool — User Guide

---

## 1. Starting a New LineString

1. In the **Map Tools** sidebar, click the **LineString** icon (green line icon).
2. A new LineString entry appears in the Scene panel on the left.
3. Move your cursor over the 3D viewport — a **ghost node** follows your mouse, snapping to the point cloud surface.

---

## 2. Drawing Nodes

| Action | Result |
|---|---|
| **Left click** | Commit the current cursor position as a permanent node |
| **Double-click** | Finish drawing (removes the dangling ghost node) |
| **Right click** | Finish drawing |
| **Enter** | Finish drawing |
| **Escape** | Finish drawing |
| **Backspace** | Remove the last committed node (ghost stays active) |

> A LineString must have at least **2 nodes** to be kept. If you finish with fewer, it is discarded automatically.

---

## 3. Selecting a LineString or Node

Selection is **mutually exclusive** — selecting the line clears any node selection, and selecting a node clears the line selection. Only the selected item turns **red**.

### Select the whole LineString

| Action | Result |
|---|---|
| **Left click** on a line segment in the 3D view | Select that LineString — edges turn **red** |
| **Click a LineString row** in the Scene panel (left sidebar) | Select that LineString |
| **Escape** (no node selected) | Deselect the LineString |

When a LineString is selected its edges change from green to **red**. The Properties panel opens automatically showing way tags and the node list. Any previously selected node is deselected.

### Select an individual node

| Action | Result |
|---|---|
| **Left click** on a node sphere in the 3D view | Select that node — sphere turns **red** |
| **Click a row** in the Properties panel node table | Select that node |
| **Click the same row / sphere again** | Deselect the node |
| **Escape** (node selected) | Deselect the current node |

When a node is selected only that sphere turns **red**; the line edges return to their original colour. Any previous whole-line selection is cleared.

> Node spheres are only visible (and clickable) when the camera is within ~500 m of the line.

---

## 4. Moving a Node

| Action | Result |
|---|---|
| **Drag** a node sphere | Move it; snaps to the point cloud surface, or stays on the same Z-plane if no surface is found |
| **Arrow keys** (node selected) | Nudge the node in camera-relative X/Y |
| **Shift + Arrow keys** | Nudge 10× faster |

> Arrow key step size is proportional to camera distance — zoom in for finer control.

---

## 5. Moving the Whole LineString

When the **whole line is selected** (no individual node selected), you can translate all nodes together.

| Action | Result |
|---|---|
| **Drag** the line body | Moves all nodes by the same XYZ offset; camera stays fixed |
| **Arrow keys** (line selected) | Nudge the whole line in camera-relative X/Y |
| **Shift + Arrow keys** | Nudge 10× faster |

The drag plane is horizontal at the line's bounding-box centroid Z, so the relative elevation of all nodes is preserved. Arrow key step size scales with camera distance, same as for node nudging.

---

## 6. Undo / Redo

All move, insert, delete, and split operations are undoable.

| Action | Result |
|---|---|
| **Ctrl + Z** | Undo last change |
| **Ctrl + Y** or **Ctrl + Shift + Z** | Redo |

Up to **50** history steps are kept per session.

---

## 7. Adding Nodes to an Existing LineString

### Insert on a segment (Shift + Click)

1. Hold **Shift** and left-click on any **line segment** (within ~8 px on screen).
2. A new node is inserted at the nearest point on that segment.

### Insert via the Properties panel

- Click the small **+** icon that appears **between two rows** in the node table.
- A new node is placed at the midpoint of that segment.

### Insert after a selected node (keyboard)

1. Select a node (see §3).
2. Press **Insert** — inserts a node immediately after the selected one (or appends at the end if the last node is selected).

---

## 8. Deleting a Node

> Minimum 2 nodes must remain — delete is blocked if only 2 are left.

| Action | Result |
|---|---|
| Select a node → press **Delete** | Deletes the selected node |
| Click the **trash icon** on a row in the Properties panel | Deletes that node |

---

## 9. Splitting a Way

Split divides one LineString into two at a selected node. Both resulting ways share the split node ID so the exported OSM topology is properly connected (useful for intersections).

### How to split

1. **Select a middle node** (any node that is not the first or last).
2. In the Properties panel, click **✂ Split way at node N**.
3. The original way is replaced by two new ways:
   - **Way A** — nodes from the start up to and including the selected node (keeps the original way ID and all tags).
   - **Way B** — nodes from the selected node to the end (assigned a new way ID on export, copies all tags).

### Constraints

| Condition | Result |
|---|---|
| Way has fewer than 3 nodes | Split button disabled |
| First or last node is selected | Split button disabled |
| Any middle node selected | Split enabled |

> Split is fully undoable with **Ctrl+Z** and redoable with **Ctrl+Y**. It counts toward the 50-step history limit.

---

## 10. Way Tags (Cost Factor, Speed Limit, and Custom Tags)

**Way tags** are key-value metadata that apply to the **entire LineString** (the OSM `<way>` element). They appear at the top of the Properties panel whenever a LineString is selected.

### Default way tags

Every newly drawn LineString starts with two pre-filled way tags:

| Key | Default value | Purpose |
|---|---|---|
| `cost_factor` | `1.000000` | Routing cost multiplier for this segment |
| `speed_limit` | `10` | Speed limit in km/h for this segment |

These defaults are editable — change the values directly in the panel.

### Add a way tag

1. Click **Add tag** at the bottom of the *Way Tags* section.
2. A new empty row appears — type the **key**, press **Enter** to jump to **value**.
3. Type the value, press **Enter** or click elsewhere to save.

### Edit a way tag

- Click any **Key** or **Value** cell and type the new content.
- Key changes commit on blur; value changes save on every keystroke.

### Delete a way tag

- Click the **×** icon on the right of the row.

> Way tags from imported OSM files are loaded into this editor and are fully editable. Edited values are written back on export.

---

## 11. Adding and Editing Tags on a Node

Tags are **custom key-value metadata** stored per node. They are exported with the linestring in both OSM and GeoJSON formats.

### Open the tag editor

1. **Select a node** (click the sphere in the 3D view, or click a row in the panel).
2. The **Tags** section appears below the node table in the Properties panel, labelled *Tags — Node N*.

### Add a tag

1. Click **Add tag** at the bottom of the tag editor.
2. Type the key, press **Enter** to jump to the **Value** field.
3. Type the value, press **Enter** or click elsewhere to save.

### Edit / Delete a tag

- Click directly into any **Key** or **Value** cell and type.
- Click the **×** icon to delete a tag row.

> Tags are preserved through undo/redo and carried into export files.

---

## 12. Deleting LineStrings

### Delete a single LineString

- In the Properties panel, click the **remove icon** (bottom-right corner).
- A confirmation dialog appears — click **Remove** to confirm or **Cancel** to abort.

### Delete all LineStrings

- Click the **remove icon** in the **Map Tools** toolbar (between the GeoJSON export and Clipped Map buttons).
- A confirmation dialog shows the count of linestrings to be removed.

> Deletion cannot be undone — undo history is cleared for removed linestrings.

---

## 13. Exporting LineStrings

Both export buttons are in the **Map Tools** sidebar.

### Export as OSM

Click the **↓ (arrow down)** icon → downloads `linestrings.osm`.

- Preserves original OSM node IDs and way metadata for imported data.
- New nodes and ways (drawn in Potree or created by splitting) receive fresh **positive** IDs that do not conflict with any existing IDs in the file.

### Export as GeoJSON

Click the **GeoJSON file** icon → downloads `linestrings.geojson`.

Output structure:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[x, y, z], ...]
      },
      "properties": {
        "name": "LineString_0"
      }
    }
  ]
}
```

---

## 14. Importing LineStrings

Click the **↑ (arrow up)** icon → opens a file picker.

- Accepts `.osm` and `.xml` files.
- A **loading status** message appears during import showing progress (`Importing linestrings: N / total`). It auto-dismisses after import completes.
- All OSM node tags and way tags are preserved and editable after import.

### Automatic coordinate conversion

If a node in the OSM file is **missing `local_x` / `local_y` tags**, the importer converts its `lat` / `lon` attributes to local scene coordinates automatically:

1. **Primary** — uses the loaded point cloud's projection (most accurate, full decimal precision).
2. **Fallback** — derives coordinates from UTM easting/northing within the MGRS 100 km grid square (matches the `local_x` / `local_y` encoding used by this project).

### Automatic elevation from point cloud

If a node is **missing an `ele` tag**, the importer finds the closest loaded point in the scene's point cloud (by XY distance) and uses its Z value as the elevation, plus a small offset (`+8 m` by default) so the linestring sits visibly above the surface.

> This requires a point cloud to already be loaded in the scene. If no point cloud is present, elevation defaults to `0`.

### Elevation offset (API)

When loading programmatically the offset can be customised:

```js
OSMImporter.loadFromFile(viewer, file, { elevationOffset: 1.0 }); // +1 m above surface
OSMImporter.loadFromFile(viewer, file, { elevationOffset: 0 });   // exact surface level
```
