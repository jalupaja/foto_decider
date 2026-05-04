with import <nixpkgs> { };

mkShell {
  buildInputs = with pkgs; [
    python313
    python313Packages.pip
    python313Packages.fastapi
    python313Packages.uvicorn
    python313Packages.pillow
    python313Packages.rawpy
  ];
}
