# Sections and modelling controls

Open **Building → Sections** (or **Sections…** under a selected beam) to browse the library. The left tree separates HEA, HEB, IPE, square, rectangular and circular hollow sections, favourites and custom profiles. A card previews each cross section. Select a card for its dimensioned drawing, structural properties and source link. Star it to add it to the favourite picker; favourites persist in browser storage and are included in backups.

**New section** and **Create from this section** make an independent editable profile. Choose a standard or saved template, change its name, shape and dimensions, and save it. Area and the two second moments of area recalculate from the dimensions. A direct A/I mode supports sections for which a shape is unavailable. Optional CAD mass and inertia fields remain reference data, separate from bending stiffness. Editing a library entry does not silently change previously assigned members: apply the saved section to the desired member or continuous beam group explicitly.

Selected members show **Beam settings** first: start/end rotational releases, continuity and beam/strut behaviour. The foldable **Beam section** area shows the assigned section with dimensions. Hover or focus its name for read-only specifications. Double-click a dimension label (or focus it and press Enter) to resize directly in this preview or the library drawing. The shape and properties preview valid values as you type; Enter / Apply size commits and Escape / Cancel size restores the original. Invalid geometry is rejected. Editing a standard creates a custom snapshot instead of changing the catalog. The member preview can resize the whole continuous beam; section area/inertia change while each segment keeps its material. The saved library preset is unchanged until you explicitly save it in Sections.

## Data and calculation conventions

- HEA and HEB dimensions, area and major/minor area inertias are a curated subset of the [ArcelorMittal Orange Book HE section properties](https://orangebook.arcelormittal.com/node/234). IPE data comes from its [IPE section properties](https://orangebook.arcelormittal.com/index.php/node/6). Values retain the published rounding.
- Hollow profiles are nominal dimension templates. Their properties are calculated, not copied from a manufacturer's product table. Rectangular/square templates use outside radius 1.5t and inside radius 1.0t, following the hot-finished radius convention documented in the [Steel for Life Blue Book](https://www.steelforlifebluebook.co.uk/explanatory-notes/bs5950/properties/). These are independently editable in custom sections. Production tolerances and manufacturer-specific corner shapes are not represented.
- Custom I/H profiles use exact rectangular and circular-root-fillet area integrals. Rectangular hollow profiles subtract the exact integrals of two rounded rectangles. Circular profiles use concentric annulus formulae. Solid rectangles use exact rectangular formulae. Geometry is in mm; A is stored in m², and I in m⁴. The existing solver uses kN and m, so E is stored in kN/m².
- The 2D solver uses the displayed **in-plane I** (bending about the horizontal centroidal axis of the shown cross section). The other-axis inertia is reference information. It does not model torsion or 3D bending. Density/mass are reference values; self-weight is not automatically added.
- Existing project properties remain authoritative. A legacy profile name with nonmatching A/I will not receive an invented cross-section drawing. Assigned profiles are snapshots inside each project, so changing or importing library entries cannot silently alter a saved calculation.

## Selection, drawing and loads

In Select, drag an empty canvas area from left to right to select contained geometry. Drag right to left to include geometry crossed by the box. Shift-click adds/removes an individual item, and Shift-box adds another region. The selection count and delete action apply to the whole selection. Deleting nodes or members also removes dependent loads. Undo restores the model.

The model tree groups segments under their continuous beam, with applied forces nested beneath the affected member and a separate nodes/supports branch. It is an optional navigator, rather than a second dimensions or constraint list.

While drawing, **Enter** finishes and returns to Select; **Escape** cancels the unfinished preview. Completed segments remain. Member labels show their physical length independently of CAD dimensions.

Point and distributed forces can be set **Normal to member** and reversed. Their direction follows geometry edits, while their magnitude remains unchanged. Typing another global direction returns the load to a global vector.

The deflection diagram labels each member’s peak sampled displacement magnitude in the selected units, with duplicate peaks at shared points consolidated. The curve is exaggerated for visibility. Linear elastic mode shows recoverable deflection; Material mode additionally calculates yielding and residual deformation through unloading. See [material analysis and reports](material-analysis.md). Section material is editable under **Material & failure limits**; changing only the profile shape preserves an already assigned material.
