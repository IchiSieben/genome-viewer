"""Pipeline offline de la plataforma AlphaGenome.

Esta capa nunca se despliega. Corre en local con la llave personal, consulta las
APIs de AlphaGenome y emite artefactos congelados en ``data/dist/``. La capa web
solo conoce el esquema de esos artefactos, jamas este codigo.
"""

__version__ = "0.1.0"

SCHEMA_VERSION = "1.1.0"
"""Version del contrato de datos entre el pipeline y la web.

Politica de versionado (ver docs/02-data-contract.md):

* **major** cambia cuando se elimina o se re-tipa un campo existente. La web
  rechaza un artefacto cuyo major no conoce y lo dice en pantalla.
* **minor** cuando se agregan campos opcionales. La web los ignora si no los
  conoce.
* **patch** cuando cambia solo documentacion o validacion.
"""
