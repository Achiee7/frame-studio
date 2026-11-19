# Sections and modelling controls

Open **Sections** from the modelling tools or a selected member. The library groups rolled I and H profiles, square and rectangular hollow sections, circular tubes, scaffold tubes and custom profiles. Select a card to inspect the section drawing, properties and source.

**Use section** applies the profile to the member shown above the preview. **Apply to multiple** returns to the drawing. Click the members you want to change, then press **Apply**. The selected member's **Quick sections** picker includes the profiles already used in that drawing and your browser's favourites. Star a profile in the library to keep it across projects. Project backups include saved profiles and favourites.

Click a boxed dimension in the library drawing or the member preview. The outline previews a valid entered size as you type. **Enter** or **Apply size** commits the edit. **Escape** cancels it. Hover or focus the profile name for detailed properties. A resized standard becomes a custom profile on the member. Save it under a name in **Sections** to reuse it in other projects.

**New section** and **Create from this section** start an editable copy. Choose a template, adjust the dimensions, and enter a name. Geometric profiles calculate area and both second moments of area. The direct-properties option accepts A and I. A custom 3D beam also needs an inertia for the second bending axis and a torsion constant. CAD mass and mass moments can be saved separately.

## Catalogue data

- HEA, HEB and IPE entries use published rounded areas and bending inertias. [ArcelorMittal HE tables](https://orangebook.arcelormittal.com/node/234), [ArcelorMittal IPE tables](https://orangebook.arcelormittal.com/index.php/node/6)
- Industrial cold-formed hollows include light square, rectangular and round tubes. The **CF** suffix distinguishes cold-formed box sections. Nominal corner radii vary with wall thickness. In the included cold-formed sizes the outside radius is twice the wall thickness, and the inside radius equals the outside radius minus the wall thickness. [Budmat Steel dimension tables](https://www.budmatsteel.com/en/products/cold-formed-hollow-sections/), [Steel for Life property conventions](https://www.steelforlifebluebook.co.uk/explanatory-notes/bs5950/properties/)
- Hot-finished square and rectangular presets use an outside radius of 1.5t and an inside radius of 1.0t. Contemporary profiles follow the Celsius nominal size tables. The earlier 60 × 60 × 3 mm SHS preset retains its original dimensions and identifier for saved projects. [Tata Steel Celsius section tables](https://www.tatasteeluk.com/sites/default/files/pimcore_doc/tata-steel-uk-celsius-overview-brochure-en.pdf), [Steel for Life property conventions](https://www.steelforlifebluebook.co.uk/explanatory-notes/bs5950/properties/)
- **Scaffold tube** includes EN 39 type 3 (48.3 mm outside diameter, 3.2 mm wall) and type 4 (48.3 mm, 4.0 mm wall). The catalogue dimensions determine section stiffness. The material model and connection behaviour are separate inputs. [JASCO scaffolding tube catalogue](https://catalogs.barralaman.com.sa/wp-content/uploads/2024/08/jasco-ksa-catalog.pdf)

## Calculation conventions

- Dimensions are stored in mm, area in m² and second moments in m⁴. Shape-based properties use circular annuli, rectangles, differences of rounded rectangles, or rectangular I-section plates plus root fillets. Model stiffness uses kN and m.
- 2D uses the in-plane second moment about the horizontal centroidal axis shown in the profile drawing. A 3D assignment supplies both bending inertias and torsional stiffness. Applying a profile preserves each destination member's orientation angle.
- The 3D solver uses tabulated torsion constants for standard rolled profiles. For custom parallel-flange I sections it estimates J with flange, web and root-junction terms. For solid rectangles it uses the Saint-Venant rectangle approximation. Circular tubes use J = 2I. The closed thin-wall formula is used for rectangular tubes. Direct section properties allow a measured or externally calculated J. [SCI P385, appendix B](https://steelconstruction.info/upload/Wiki-Files/6/6f/Sci_p385.pdf), [NASA rectangular torsion approximation](https://ntrs.nasa.gov/api/citations/19950017797/downloads/19950017797.pdf)
- Assigned profiles are stored in the project. Editing a library profile affects future assignments. A legacy or manually entered section with only stiffness data displays its numerical properties. CAD mass and mass moments are reference data. Add a load explicitly to include self-weight.

## Selection, drawing and loads

In Select, drag an empty canvas area from left to right to select contained geometry. Drag right to left to include geometry crossed by the box. Shift-click adds/removes an individual item, and Shift-box adds another region. The selection count and delete action apply to the whole selection. Deleting nodes or members also removes dependent loads. Undo restores the model.

The model tree groups segments under their continuous beam, with applied forces nested beneath the affected member and a separate nodes/supports branch. It is an optional navigator, rather than a second dimensions or constraint list.

While drawing, **Enter** finishes and returns to Select; **Escape** cancels the unfinished preview. Completed segments remain. Member labels show their physical length independently of CAD dimensions.

Point and distributed forces can be set **Normal to member** and reversed. Their direction follows geometry edits, while their magnitude remains unchanged. Typing another global direction returns the load to a global vector.

The deflection diagram labels each member’s peak sampled displacement magnitude in the selected units, with duplicate peaks at shared points consolidated. The curve is exaggerated for visibility. Linear elastic mode shows recoverable deflection; Material mode additionally calculates yielding and residual deformation through unloading. See [material analysis and reports](material-analysis.md). Section material is editable under **Material & failure limits**; changing only the profile shape preserves an already assigned material.
