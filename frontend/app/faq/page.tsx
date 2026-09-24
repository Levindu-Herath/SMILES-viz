type FaqItem = {
  slug: string;
  question: string;
  answer: React.ReactNode;
};

type FaqCategory = {
  category: string;
  items: FaqItem[];
};

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-primary-50 px-1.5 py-0.5 font-mono text-xs text-primary-700">
      {children}
    </code>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-text-secondary">{children}</p>;
}

const questions: FaqCategory[] = [
  {
    category: "General",
    items: [
      {
        slug: "what-is-molytica",
        question: "What is Molytica?",
        answer: (
          <P>
            Molytica is a web application for exploring small molecules. You can draw a
            molecule&apos;s 2D structure from its SMILES string or common name, inspect its
            physicochemical and drug-likeness properties through a bioavailability radar, and
            run bioactivity predictions against specific cancer cell-line datasets. Under the
            hood, predictions come from a sparse dictionary learning model that represents each
            molecule as a sparse combination of a small number of learned substructure patterns
            derived from Weisfeiler–Leman graph kernels.
          </P>
        ),
      },
      {
        slug: "who-is-it-for",
        question: "Who is this application for?",
        answer: (
          <P>
            Molytica is designed for chemistry and bioinformatics students, researchers
            exploring cheminformatics pipelines, and anyone interested in how graph-based
            machine learning can be applied to molecular property prediction. It is also
            intended as a demonstration of the sparse dictionary learning methodology developed
            in this Final Year Project. Familiarity with SMILES notation is helpful but not
            strictly required — you can search molecules by common name via the PubChem lookup.
          </P>
        ),
      },
      {
        slug: "is-it-a-drug-discovery-tool",
        question: "Is Molytica a drug discovery tool?",
        answer: (
          <P>
            No. Molytica is developed as an academic Final Year Project for the purpose of
            mathematical and algorithmic verification of sparse dictionary learning applied to
            molecular graph data. While it implements a functional cheminformatics pipeline, it
            has not undergone the rigorous validation, clinical trials, or regulatory review
            required of a drug discovery platform. Predictions should be treated as illustrative
            outputs of the underlying algorithm, not as actionable pharmacological conclusions.
          </P>
        ),
      },
    ],
  },
  {
    category: "Using the Application",
    items: [
      {
        slug: "visualize-a-molecule",
        question: "How do I visualize a molecule?",
        answer: (
          <P>
            Navigate to the Analyze tab. Enter a SMILES string directly into the input field, or
            type a common compound name (e.g. &quot;aspirin&quot;) to look it up via the PubChem
            PUG REST API. Once submitted, the application renders the molecule&apos;s 2D
            structure and calculates a set of physicochemical descriptors including molecular
            weight, LogP, hydrogen bond donors/acceptors, topological polar surface area (TPSA),
            and rotatable bond count.
          </P>
        ),
      },
      {
        slug: "bioavailability-radar",
        question: "What does the bioavailability radar show?",
        answer: (
          <P>
            The bioavailability radar is a hexagonal chart displaying six key physicochemical
            axes: lipophilicity, size, polarity, solubility, saturation, and flexibility. Each
            axis is scaled to a range that characterizes orally bioavailable drug-like
            molecules, following the methodology described by SwissADME. A molecule whose radar
            profile falls mostly within the shaded drug-like zone is more likely to exhibit
            favorable oral bioavailability. Values that exceed the zone boundary indicate
            properties outside the typical drug-like range for that axis.
          </P>
        ),
      },
      {
        slug: "run-a-prediction",
        question: "How do I run a bioactivity prediction?",
        answer: (
          <>
            <P>
              To use the built-in reference models, go to the Analyze tab, switch to Predict
              mode, choose a cancer type, and enter a SMILES string or compound name. To use a
              model you trained yourself with the local trainer, go to the My Models tab, select
              the model, and enter a molecule there.
            </P>
            <P>
              The backend loads the corresponding WL kernel → FDDL → classifier pipeline,
              computes the sparse representation of the input molecule, and returns a predicted
              bioactivity class. Predictions made with the reference models on the Analyze tab
              also include substructure-level atom heatmaps showing which parts of the molecule
              contributed most to the prediction.
            </P>
          </>
        ),
      },
      {
        slug: "atom-heatmaps",
        question: "What do the atom heatmaps mean?",
        answer: (
          <P>
            After a reference-model prediction, Molytica overlays a color gradient on the
            molecule&apos;s 2D structure. Red atoms support the predicted class and blue atoms
            oppose it; darker shades indicate a stronger influence. The scores come from the
            learned dictionary atoms associated with those substructures and their coefficients
            in the sparse representation. This provides interpretability into which molecular
            substructures the model considers most relevant for the predicted class. Note that
            these attributions reflect the model&apos;s learned patterns and are not validated
            chemical explanations of bioactivity.
          </P>
        ),
      },
    ],
  },
  {
    category: "Training & Models",
    items: [
      {
        slug: "local-trainer",
        question: "What is the local trainer?",
        answer: (
          <P>
            The local trainer (<InlineCode>molytica-trainer</InlineCode>) is a Python package
            distributed via PyPI that runs a FastAPI server on your own machine at{" "}
            <InlineCode>localhost:5000</InlineCode>. It allows you to train sparse dictionary
            learning models on your own datasets locally, meaning your molecular data never
            leaves your computer during the training process. The trainer handles the full
            pipeline: Weisfeiler–Leman kernel computation, Fisher Discriminant Dictionary
            Learning (FDDL), and classifier fitting.
          </P>
        ),
      },
      {
        slug: "install-trainer",
        question: "How do I install and run molytica-trainer?",
        answer: (
          <>
            <P>
              You will need Python 3.11+ and a conda environment with RDKit installed from
              conda-forge (<InlineCode>conda install -c conda-forge rdkit</InlineCode>) — RDKit
              must come from conda, not pip. Then install the trainer from PyPI with{" "}
              <InlineCode>pip install molytica-trainer</InlineCode>; its remaining dependencies
              (scikit-learn, scipy, gensim, networkx, joblib) are installed automatically.
            </P>
            <P>
              Launch the local server with{" "}
              <InlineCode>python -m molytica_trainer.cli</InlineCode> (on macOS/Linux you can
              also run <InlineCode>molytica-train</InlineCode>). The server starts on{" "}
              <InlineCode>http://localhost:5000</InlineCode> and the Molytica web app detects it
              automatically. The Train page walks through the same steps.
            </P>
          </>
        ),
      },
      {
        slug: "upload-a-model",
        question: "How do I upload a trained model?",
        answer: (
          <P>
            Once training completes, the Train page shows the run&apos;s results with an option
            to publish the model. Publishing uploads the resulting model bundle (containing the
            learned dictionary, classifier weights, thresholds, and a manifest) to your Molytica
            cloud account, where it appears under the My Models tab. Bundles are stored in your
            private Supabase storage bucket and become available for inference via the cloud
            backend. Only you can access your uploaded models.
          </P>
        ),
      },
      {
        slug: "classifiers",
        question: "What classifiers are available for training?",
        answer: (
          <P>
            The training pipeline currently supports Logistic Regression, Gradient Boosting,
            Linear SVM (Support Vector Classification with a linear kernel), and Random Forest as
            the final classification stage after dictionary learning. These were selected for
            their compatibility with the sparse representation framework. The choice of
            classifier is specified when you configure a training job on the Train page.
          </P>
        ),
      },
    ],
  },
  {
    category: "Data & Privacy",
    items: [
      {
        slug: "data-storage",
        question: "Where is my data stored?",
        answer: (
          <P>
            Account information and uploaded model bundles are stored in Supabase
            (authentication and cloud storage). Datasets you upload on the Datasets page are
            stored in a private Supabase bucket tied to your account. When using the local
            trainer, all data — including molecular datasets, intermediate kernel matrices, and
            trained model artifacts — remain on your local machine and are never transmitted to
            any external server unless you choose to publish a model.
          </P>
        ),
      },
      {
        slug: "privacy-preserving",
        question: "What does “privacy-preserving” mean in this context?",
        answer: (
          <P>
            Privacy-preserving refers specifically to the local training architecture. Because{" "}
            <InlineCode>molytica-trainer</InlineCode> runs entirely on your machine, sensitive
            or proprietary molecular datasets do not need to leave your local environment for
            model training. The only data that crosses the network is the final trained model
            bundle when you explicitly choose to upload it for cloud-based inference. This
            design is intentional for research settings where molecular data may be
            confidential or proprietary.
          </P>
        ),
      },
    ],
  },
  {
    category: "Limitations & Disclaimer",
    items: [
      {
        slug: "clinically-validated",
        question: "Are the predictions clinically validated?",
        answer: (
          <P>
            No. The bioactivity predictions are outputs of a sparse dictionary learning model
            trained on NCI cancer cell-line screening datasets (NCI-1, NCI-33, NCI-41). These
            datasets are standard graph classification benchmarks used in machine learning
            research. The predictions have not been validated against clinical outcomes, and
            the model&apos;s accuracy is bounded by the size and representativeness of the
            training data. This application exists to demonstrate and verify the mathematical
            properties of the WL kernel and FDDL classification pipeline, not to provide
            medically actionable predictions.
          </P>
        ),
      },
      {
        slug: "research-paper",
        question: "Can I use Molytica results in a research paper?",
        answer: (
          <P>
            You may reference Molytica as a demonstration tool and cite the underlying
            methodology (Weisfeiler–Leman kernels, Fisher Discriminant Dictionary Learning).
            However, any published use should clearly state that the results are from an
            unvalidated academic prototype and should not be presented as evidence of
            pharmacological activity. We recommend citing the Final Year Project report and the
            original algorithmic references.
          </P>
        ),
      },
      {
        slug: "known-limitations",
        question: "What are the known limitations?",
        answer: (
          <P>
            The current implementation has several known limitations: (a) predictions are
            limited to three cancer types based on the available NCI benchmark datasets; (b) the
            bioavailability radar uses clamped normalization, meaning extreme out-of-range
            values are clipped to the boundary rather than displayed beyond it; (c) atom heatmap
            attributions reflect learned statistical patterns, not causal chemical mechanisms;
            (d) the local trainer requires a moderately capable machine for kernel computation
            on large datasets; (e) the CORS configuration of the local trainer permits
            connections from any <InlineCode>*.vercel.app</InlineCode> subdomain, which is a
            known security limitation in the current release.
          </P>
        ),
      },
    ],
  },
];

// Numbering runs continuously across categories (1–N).
const categoryOffsets = questions.map((_, i) =>
  questions.slice(0, i).reduce((n, c) => n + c.items.length, 0),
);

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-surface-bg text-text-primary">
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Frequently Asked Questions
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            What Molytica is, how to use it, and what it is not.
          </p>
        </div>

        {/* Table of contents */}
        <nav
          id="contents"
          aria-label="FAQ contents"
          className="scroll-mt-20 rounded-lg border border-surface-border bg-surface-card p-5 space-y-5"
        >
          {questions.map(({ category, items }, ci) => (
            <div key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-primary-600 mb-2">
                {category}
              </h2>
              <ol
                start={categoryOffsets[ci] + 1}
                className="list-decimal pl-6 space-y-1 text-sm text-text-secondary marker:text-text-muted"
              >
                {items.map(({ slug, question }) => (
                  <li key={slug}>
                    <a href={`#${slug}`} className="text-primary-500 hover:underline">
                      {question}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>

        {/* Answers */}
        {questions.map(({ category, items }, ci) => (
          <section key={category} className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-primary-600">
              {category}
            </h2>
            {items.map(({ slug, question, answer }, qi) => (
              <article
                key={slug}
                id={slug}
                className="scroll-mt-20 rounded-lg border border-surface-border bg-surface-card p-5"
              >
                <h3 className="text-base font-semibold text-text-primary">
                  {categoryOffsets[ci] + qi + 1}. {question}
                </h3>
                <div className="mt-2 space-y-3">{answer}</div>
                <div className="mt-4 text-right">
                  <a href="#contents" className="text-xs text-primary-500 hover:underline">
                    Back to top
                  </a>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
