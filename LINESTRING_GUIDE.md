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

## 3. Selecting a LineString

### Select the whole LineString

| Action | Result |
|---|---|
| **Left click** on a line segment in the 3D view | Select that LineString (edges turn **cyan**) |
| **Click a LineString row** in the Scene panel (left sidebar) | Select that LineString |
| **Escape** (no node selected) | Deselect the LineString |

When a LineString is selected its edges change from green to **red** as a visual indicator. The Properties panel opens automatically showing the way tags and node list.

### Select an individual node

| Action | Result |
|---|---|
| **Ctrl + Left click** on a node sphere in the 3D view | Select that node (turns red) |
| **Click a row** in the Properties panel node table | Select that node |
| **Click the same row again** | Deselect |
| **Escape** (node selected) | Deselect the current node |

A selected node highlights **yellow** on its connected segments and **red** on the sphere.

---

## 4. Moving a Node

| Action | Result |
|---|---|
| **Drag** a node sphere in the 3D view | Move it; snaps to point cloud or stays on the same Z-plane if no surface is found |
| **Arrow keys** (node selected) | Nudge the node in camera-relative X/Y |
| **Shift + Arrow keys** | Nudge 10× faster |

> Arrow key movement is proportional to camera distance — zoom in for finer control.

Undo / Redo works for all move operations:

| Action | Result |
|---|---|
| **Ctrl + Z** | Undo last change |
| **Ctrl + Y** or **Ctrl + Shift + Z** | Redo |

Up to **50** history steps are kept per session.

---

## 5. Adding Nodes to an Existing LineString

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

## 6. Deleting a Node

> Minimum 2 nodes must remain — delete is blocked if only 2 are left.

| Action | Result |
|---|---|
| Select a node → press **Delete** | Deletes the selected node |
| Click the **trash icon** on a row in the Properties panel | Deletes that node |

---

## 7. Way Tags (Cost Factor, Speed Limit, and Custom Tags)

**Way tags** are key-value metadata that apply to the **entire LineString** (the OSM `<way>` element), as opposed to individual nodes. They appear at the top of the Properties panel whenever a LineString is selected.

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

## 8. Adding and Editing Tags on a Node

Tags are **custom key-value metadata** stored per node. They are exported with the linestring in both OSM and GeoJSON formats.

### Open the tag editor

1. **Select a node** (Ctrl + Click in 3D view, or click a row in the panel).
2. The **Tags** section appears below the node table in the Properties panel, labelled *Tags — Node N*.

### Add a tag

1. Click **Add tag** at the bottom of the tag editor.
2. A new empty row appears with the cursor in the **Key** field.
3. Type the key, press **Enter** to jump to the **Value** field.
4. Type the value, press **Enter** or click elsewhere to save.

### Edit an existing tag

- Click directly into any **Key** or **Value** cell and type.
- **Key** changes are committed on blur (clicking away or pressing Tab).
- **Value** changes are saved on every keystroke.

### Delete a tag

- Click the **×** icon on the right side of the tag row.

> Tags are preserved through undo/redo and carried into export files.

---

## 9. Deleting a Whole LineString

- In the Properties panel, click the **red remove icon** (bottom-right of the panel).
- Or select the linestring in the Scene tree and press **Delete**.

---

## 10. Exporting LineStrings

Both export buttons are in the **Map Tools** sidebar.

### Export as OSM

Click the **↓ (arrow down)** icon → downloads `linestrings.osm`.

- Preserves original OSM node IDs and way metadata for imported data.
- New nodes are assigned temporary negative IDs compatible with JOSM.

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
        "coordinates": [[lon, lat, z], ...]
      },
      "properties": {
        "name": "LineString_0",
        "tags": { },
        "nodes": [
          { "tags": { "key": "value" } }
        ]
      }
    }
  ]
}
```

- Nodes imported from OSM use their original **longitude/latitude** as coordinates.
- Manually drawn nodes use **local X/Y/Z** coordinates.
- The `nodes` array is only included when at least one node has tags.

---

## 11. Importing LineStrings

Click the **↑ (arrow up)** icon → opens a file picker.

- Accepts `.osm` and `.xml` files.
- All OSM node tags and way tags are preserved and editable after import.
