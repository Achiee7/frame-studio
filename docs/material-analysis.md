# Materials, units and worked reports

## Inputs and colour states

Select a member, unfold **Material & failure limits**, and choose a preset or enter custom properties. S235JR is the default; common structural steels, stainless grades, aluminium alloys and engineering plastics are included. Sources and product assumptions appear with each preset. The default post-yield tangent is an assumed 1% of E. It must be replaced with justified material data where necessary. Stainless and plastic presets do not invent a failure threshold.

Results → a diagram opens its floating options. Choose **Material · loading & unloading** or **Linear elastic**. Material response runs in a worker so the interface remains responsive. Edits invalidate old results until the new run completes.

- Green: no section fibres yielded in this material model; deformation recovers on unloading.
- Orange: plastic history was recorded. The permanent set is the residual displacement calculated after unloading all external forces to zero.
- Red: an entered tensile stress limit, an absolute strain limit, or an ideal perfectly plastic mechanism was reached. Loading stops at the reached load fraction. No post-rupture or post-mechanism deformation is invented.
- Gray: equilibrium could not be resolved or inputs are unsupported. Numerical nonconvergence is not proof of structural failure.

Limits describe the implemented model, not all possible failure modes. A material without an entered limit can still yield, but the program cannot rule out material failure for it.

## Method and restrictions

The material solver uses small-displacement Euler–Bernoulli beam elements and axial struts. It retains shared translations, rigid or separate release rotations and spring stiffness. Beam members are divided at eighth points and concentrated loads; axial struts are split at interior axial loads. Three longitudinal Simpson integration stations are used in each element. Beam sections use 48 layers with two Gauss points per layer; their total area and second moment are calibrated to the assigned A and I. Zero-area surface fibres check first yield and limits. A stored shape inconsistent with A/I by more than 3% is rejected rather than silently replaced.

Each fibre uses a one-dimensional bilinear kinematic-hardening return map. The effective hardening modulus is H = Eb/(1−b), with b = Eₜ/E. An elastic predictor is corrected for yield; signed plastic strain and back stress are carried to the next converged increment. Loading uses 32 increments with adaptive subdivision; each Newton attempt has at most 45 iterations and a residual-reducing line search. History is committed only after equilibrium. The minimum attempted load step is 1/16.384. Free residual tolerance is 10⁻⁸ times max(1, largest nodal force/moment number), using kN and kN m calculation units. Unloading uses 32 increments with the same constitutive history, including reverse yielding if it occurs.

Tensile failure checks compare positive normal stress to the optional tensile limit; compression is not compared with tensile strength. The optional strain limit uses absolute strain. These are simplified stop criteria, not a ductile damage or fracture propagation model. A zero-hardening material can form an ideal plastic mechanism. Initial instability is checked separately before loading.

Material mode currently supports at most 20 members, requires section geometry for bending beams, and does not support imposed support settlements. Linear elastic mode remains available for A/I-only members, imposed settlements and models up to 80 members. Displacement extrema are sampled. Mesh and fibre refinement may be needed near yield and local load effects.

Neither solver models geometric nonlinearity, buckling, local section instability, connections, shear failure, creep, fatigue, dynamics or design-code resistance. Large strain/rotation warnings mean the small-displacement model is outside its intended range. Engineering plastics are represented only by a short-term symmetric bilinear approximation: temperature, moisture, strain-rate, viscoelasticity and stress softening are excluded. There is no universal green “safe” result.

The constitutive and section approach is documented by the [OpenSees Steel01 reference](https://opensees.berkeley.edu/OpenSees/manuals/usermanual/180.htm) and [fibre section reference](https://opensees.berkeley.edu/OpenSees/manuals/usermanual/189.htm). This is an independent implementation, not OpenSees running in the browser. The test suite includes independent analytical axial plastic stretch/unloading and rectangular-section elastic-core/plastic-bending solutions, failure load factors, elastic equivalence and equilibrium checks.

## Units and number entry

Settings independently select dimensions/coordinates (mm, cm, m, in, ft), forces (N, kN, MN, lbf, kip), stress/yield (Pa through GPa, psi, ksi), moments, deflection and distributed-load length denominator. Calculations remain in m, kN and kN m. Material stress fields are stored in MPa; modulus in kN/m². CAD geometry remains in mm and section area/inertia are explicitly labelled. Changing units does not change the physical model. Conversions use [NIST SP 811](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9).

Display uses a decimal comma and dot thousands separator, for example **12.345,67**. Enter fractional values with a comma. Dot-only groups such as **1.234** mean one thousand two hundred thirty-four; scientific notation is supported. JSON backups use normal JSON numeric syntax, independently of display preferences.

## Reports that can be checked

**Report & reversals** produces independent linear elastic cases. It lets you exclude impossible combinations, then renders a worked governing case with LaTeX equations: geometry, EA/EI, element matrix, coordinate transformation, equivalent loads, support partition, a numerical matrix row, local end actions, reactions and extrema. Each included case has a separately calculated equilibrium check. The complete K, F, U, model and element matrices for the worked case are embedded in the HTML as `frame-calculation-audit` JSON.

**Download worked calculation report** in material result options exports the current material run. It includes entered material/section properties and sources, equations with actual values from one recorded fibre, the converged load/unload path, reached load fraction, residual displacement, reactions, criteria and scope. Independent maxima are not combined into one fictitious fibre. The complete model, factors, paths and results are embedded as `material-calculation-audit` JSON.

Reports are standalone HTML with embedded KaTeX styles and fonts; no CDN or connection is needed to read the downloaded equations. Open the downloaded document and choose **Print / save as PDF**. Numerical substitutions are rounded for legibility; checks use unrounded values. Positive global moment is counterclockwise; local x follows the member and local y is its counterclockwise normal. Equilibrium residuals test force balance, not whether the model represents the real structure.

Nonlinear reversal envelopes are deliberately not synthesized from independent elastic cases: plastic response depends on the actual load history. Generate a material report for each justified history separately.
