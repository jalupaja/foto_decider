{ pkgs ? import (fetchTarball "https://github.com/NixOS/nixpkgs/archive/nixos-24.05.tar.gz") {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    python313
    python313Packages.pip
    python313Packages.fastapi
    python313Packages.uvicorn
    python313Packages.pillow
    python313Packages.rawpy
  ];
}
