# 3D frame analysis

In **3D-model**, select a joint or member and choose **Add load**. A force or moment takes a signed value along a global axis, or three signed XYZ components. A concentrated member load also takes a distance from end A. A uniform distributed load covers the full member and takes force per unit length. Apply the physical supports at the joints that attach the structure to its surroundings.

Open **3D Results** to inspect support reactions, displacement, axial force, shear, bending or torsion. Select a member to move the inspection station along its length, including both sides of a concentrated load. The marker shows the station and the local axes on the frame. Selecting the member link under the peak value goes directly to the governing station. A joint selection gives global components. The deflection legend displays the drawing magnification. **Show true displacement (1×)** uses the same scale for the geometry and its displacement.

## Axes, joints and supports

Global Z is up. The local member x-axis runs from A to B. At zero roll, local z points along the projection of global Z onto the cross-section plane. A vertical member uses global X as that reference. Positive section roll follows the right-hand rule around local x. The result diagrams use local axial force $N$, shears $V_y,V_z$, torque $T$ and bending moments $M_y,M_z$. Positive values act along their named axes on the positive x cut face. Tensile axial force is positive.

Every member end at a shared joint has the same translation. A **Rigid** joint also shares the rotations of all connected beams. A **Pin** keeps segments of the same split beam continuous and lets separate crossing beams rotate independently. An **Internal hinge** gives each beam its own end rotation. Apply a joint moment at a rigid connection, or apply it to a particular beam end to identify which beam carries it.

| Support in the editor | Restraint in 3D |
| --- | --- |
| Free | No ground restraint |
| Hinge | Fixes X, Y and Z translation. Rotations are free. |
| Hinge roller | Fixes Z translation. |
| Side roller | Fixes X translation. |
| Fixed | Fixes X, Y and Z translation. At a rigid joint it also fixes all three rotations. |
| Fixed roller | Fixes Z translation. At a rigid joint it also fixes all three rotations. |
| Spring | Applies a restoring force $R_z=-k u_z$ in global Z. The editable default is 10,000 kN/m. |

Sketch dimensions and geometric constraints determine the built geometry. Ground restraint in the analysis comes from the support settings. A point that must transmit load between members needs a common structural joint.

## Stiffness and load recovery

Each prismatic beam has three translations and three rotations at each end. Its axial stiffness is $EA/L$, its torsional stiffness is $GJ/L$, and the two bending planes use $EI_y$ and $EI_z$. Frame Studio uses the Euler–Bernoulli limit of the spatial beam stiffness matrix. A strut carries axial force only. It accepts an interior axial force or an axial distributed load. Apply transverse forces at connected joints or use a beam element for a member carrying transverse load. [Duke University, 3D elastic stiffness matrix, section 6](https://people.duke.edu/~hpgavin/cee421/frame-finite-def.pdf) · [OpenSees, 3D elastic beam properties and axes](https://openseesdocumentation.readthedocs.io/en/latest/user/manual/model/elements/elasticBeamColumn.html)

1. Transform each member stiffness and its equivalent nodal loads to global XYZ, then assemble the global stiffness matrix $K$ and load vector $f$.
2. Impose the supports and joint releases and solve the free system $K_{ff}u_f=f_f$. Evaluate the restrained reactions using $R=Ku-f$ and include the elastic support reactions.
3. Recover local element end forces, internal forces and displacements along the member. Point loads create separate cuts immediately before and after their station. The displacement maximum includes interior extrema.
4. Sum the applied loads and reactions to check global equilibrium. Moment equilibrium about the sketch origin includes both applied couples and $\mathbf{r}\times\mathbf{F}$.

Internally the solver uses metres, kN and radians. Section roll is entered in degrees. The unit settings control loads, moments, displacements, stress units for moduli and numeric formatting. The **Section stiffness** editor uses cm² and cm⁴ for metric models, or in² and in⁴ when the geometry unit is inches or feet.

A member without assigned properties uses an HEA 120 steel profile with $E=210$ GPa, $G=E/2.6$, $A=25.3$ cm², $I_y=606$ cm⁴, $I_z=231$ cm⁴ and $J=6.04$ cm⁴. Library entries supply the material’s elastic modulus and assume Poisson’s ratio 0.30 for $G$. Rolled HE and IPE presets use tabulated Saint-Venant torsion constants. Circular hollow sections use $J=2I$. Rectangular and square hollow presets use a single-cell thin-wall estimate. Every stiffness property and the roll are editable on an individual member. [ArcelorMittal HE section properties](https://orangebook.arcelormittal.com/node/234) · [ArcelorMittal IPE section properties](https://orangebook.arcelormittal.com/index.php/node/6)

## Reading a diagnostic

An unrestrained translation or a moment about a free rotation makes the structure unstable. An isolated unloaded joint is omitted. A free beam spin with zero applied torque can leave displacements, member forces and reactions uniquely determined. The solver flags the undetermined joint rotation.

The calculation assumes small displacements, linear elastic material, Saint-Venant torsion and negligible transverse shear deformation. The solver checks its estimated member rotation against 0.1 rad, relative displacement divided by member length against 0.05, and absolute axial strain $|N/(EA)|$ against 0.02. Crossing any of these modelling limits suppresses the diagrams. Material yielding, permanent set, torsional warping, buckling and connection capacity require separate analyses.
