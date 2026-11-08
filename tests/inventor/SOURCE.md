# NIST native Inventor files (I1, D-032)

The 16 `.ipt` files in `files/` are NIST's, byte for byte, unpacked with `unzip -j` from two NIST downloads. Never edit or replace them; `tests/service/test_inventor_part.py::test_checksums` checks each SHA-256 below.

- `NIST-FTC-CTC-PMI-CAD-models.zip`: https://www.nist.gov/document/nist-ftc-ctc-pmi-cad-models, 60,294,624 bytes, SHA-256 `17e14dbf207f447f16e0182a7eda5254ee19afff591dd409b8b510103dd05d10`. Folder `Inventor 2021/` gives the 11 `*_2021.ipt` files.
- `NIST-STC-PMI-v4.zip`: https://www.nist.gov/document/nist-stc-pmi-v4, 51,125,067 bytes, SHA-256 `bb4fb9939476542af6e90fd2616b4e897756916494a4c92f11404fc13dd1aba8`. Folder `Inventor/` gives the 5 `*_2024.ipt` files (NIST STC 06-10, named `INV_nist_ftc_<NN>_asme1_2024.ipt`).
- Downloaded and checked: 2026-11-08. Total 13,755,904 bytes.
- Licence: both READMEs say "this test system is not subject to copyright protection and is in the public domain" (SAFE-05).
- Morgan's work pairs go in `.local/` (git-ignored) and never enter git (D-006, D-032).

## SHA-256

```
c3716769b86d5fb7db9b65fa4c785c0f98db92258af0a801d544ab7d83251ec3  INV_nist_ctc_01_asme1_2021.ipt
d0027e6469e71bdc7c9ed75c67ee8dafea1dd16e78e72249c1825f918168573d  INV_nist_ctc_02_asme1_2021.ipt
6015216e51931b3ff173f1fdccef1583b37d31540d12914319b59d5d6ef5011c  INV_nist_ctc_03_asme1_2021.ipt
c4b483d35ecdeeae98f8bfc206fb5d5e0c459c622c9e0fe34d55593478089d7f  INV_nist_ctc_04_asme1_2021.ipt
27af6adf58e41f13d18291c4e4ea5bf1ac4ed571751fb1c538c2d45feb255c26  INV_nist_ctc_05_asme1_2021.ipt
b726dec98a86e26fe9987bbbdeaff34396859130d576ae5bc3be7a69d7e60891  INV_nist_ftc_06_asme1_2021.ipt
3b6ef80aeb2aafb65327461ff04a33140d0a6888edc272c51273c7a1ab6e35e6  INV_nist_ftc_06_asme1_2024.ipt
afa1293e6d8852d04c0733947578d8f19949d99f49227521c248b9dc4104d99c  INV_nist_ftc_07_asme1_2021.ipt
b691d3d29a73ee9e0be4290692f79a85c7829754f786beff2fa901971c4f6a68  INV_nist_ftc_07_asme1_2024.ipt
d501948d2e752d1a4a24165873340b7effcd31194092b0033c46a86939b61fd1  INV_nist_ftc_08_asme1_2021.ipt
8fde251df9385988984a6a81f2f6b07cb113a862f87d931ca08abac4da5867f1  INV_nist_ftc_08_asme1_2024.ipt
98e01cb4bca340c3d2e8604893ace7ed3252975e27de611844c004bc70e3b3ac  INV_nist_ftc_09_asme1_2021.ipt
02cd8a89bedb341b39e65461859500769efde3ea33e78d142825d5d2bde71b37  INV_nist_ftc_09_asme1_2024.ipt
58db08fc38f417e63cea961e7cbb5d853ca5f9210c64a0ed9a0c4cbc1d556acd  INV_nist_ftc_10_asme1_2021.ipt
142317b7adec77791951180379673b82e138bf9446b713fc79f4e19905a25deb  INV_nist_ftc_10_asme1_2024.ipt
0f507d3d753855324a56088a387581fadfaf63b639c1231c2429f5632af76163  INV_nist_ftc_11_asme1_2021.ipt
```
