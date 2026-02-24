Chinese Sociological Review

ISSN: 2162-0555 (Print) 2162-0563 (Online) Journal homepage: www.tandfonline.com/journals/mcsa20

A machine, not an intelligence: how Chinese

programmers imagine generative artificial

intelligence

Yingfa Wu & Baicheng Sun

To cite this article: Yingfa Wu & Baicheng Sun (28 Jan 2026): A machine, not an intelligence:

how Chinese programmers imagine generative artificial intelligence, Chinese Sociological

Review, DOI: 10.1080/21620555.2026.2620115

To link to this article: https://doi.org/10.1080/21620555.2026.2620115

Published online: 28 Jan 2026.

Submit your article to this journal

View related articles

View Crossmark data

Full Terms & Conditions of access and use can be found at

https://www.tandfonline.com/action/journalInformation?journalCode=mcsa20



-- 1 of 37 --



Chinese soCiologiCal Review

A machine, not an intelligence: how Chinese

programmers imagine generative artificial

intelligence

Yingfa Wua and Baicheng Sunb

aUniversity of Cambridge, Cambridge, UK; bTsinghua University, Beijing, China

ABSTRACT

Imaginaries have become an essential analytic lens

for understanding how emerging technologies like

generative artificial intelligence (AI) are envisioned.

While existing studies have begun to explore these

collective visions, they remain predominantly focused

on a macro-level perspective, emphasizing national

and public imaginaries, while overlooking those

shaped by key professional groups. This study

addresses this gap by examining how programmers,

who occupy an intermediary role between generative

AI and society, imagine this transformative technol-

ogy. Drawing on insights from the Social Construction

of Technology (SCOT) and the concept of imaginaries,

we adopt a mixed-methods approach combining

computational text analysis of online forum posts

with a national survey of 14,445 Chinese program-

mers. Online discussions reveal two imaginaries:

“AI-as-Machine,” which frames AI as a powerful yet

controllable tool, and “AI-as-Intelligence,” which casts

it as an autonomous and potentially disruptive agent.

Survey evidence further confirms the dominance of

the “AI-as-Machine” imaginaries, particularly among

technically proficient programmers. By centering pro-

grammers’ pivotal position, this study not only

grounds imaginaries in concrete metaphors, but

offers a micro-foundation for understanding China’s

rapid, tool-driven adoption of generative AI.

https://doi.org/10.1080/21620555.2026.2620115

© 2026 Taylor & Francis group, llC

CONTACT Baicheng sun 	sbc22@mails.tsinghua.edu.cn 	Department of sociology (Xiongzhixing

Building Room 212), Tsinghua University, shuangqing Road no. 30, haidian District, Beijing, 100084,

China



-- 2 of 37 --



2 	Y. WU AND B. SUN

Introduction

Sociologists of technology have long argued that the development and

social consequences of emerging technologies are not solely determined

by inventors or scientific elites. Rather, they are co-constructed through

the practices and interpretations of the wider public who incorporate

these technologies into everyday life (Williams and Edge 1996). Within

this tradition, the Social Construction of Technology (SCOT) framework

has gained prominence for highlighting the interpretative flexibility of

technology (MacKenzie and Wajcman 1999, 21–23). According to SCOT,

technological artifacts may acquire divergent meanings depending on the

social groups involved in the process of design, implementation, and use.

These meanings, in turn, produce different social outcomes (Pinch and

Bijker 1984).

In the case of generative artificial intelligence (AI), determinist narra-

tives persist in subtle and residual forms (Wachter-Boettcher 2018, 9),

despite long-standing critiques in SCOT and the wider sociology of tech-

nology (Joyce et al. 2023). Such narratives often appear in exaggerated

claims about novelty and in portrayals of generative AI as an external

force disrupting economic and social systems. While it is true that gen-

erative AI can now perform tasks involving cognition and abstraction

(Du et al. 2025), thereby shifting task boundaries and potentially chal-

lenging occupational structures (Acemoglu et al. 2022), these capabilities

are always mediated through social practices. A recent OpenAI-supported

study shows that ChatGPT is adopted for diverse purposes, from coding

and debugging to report writing, language learning, and everyday infor-

mation search (Chatterji et al. 2025). Crucially, these practices vary sys-

tematically across educational backgrounds, professions, and industries,

indicating that imaginaries of generative AI are already stratified along

social lines. As a result, a sociological approach must begin by examining

how 	these 	capabilities 	are 	interpreted 	and 	acted 	upon 	by 	different

social groups.

Building on SCOT, more recent scholarship has introduced the concept

of imaginaries to capture how collective visions of technology are both

shaped 	by 	and 	constitutive 	of 	broader 	socioeconomic 	arrangements

(Jasanoff and Kim 2009; McNeil et al. 2017; Richter, Katzenbach, and

Zeng 2025). Unlike SCOT, which usually focuses retrospectively on pro-

cesses of closure and stabilization, imaginaries are especially well suited

for analyzing forward-looking and anticipatory orientations. This distinc-

tion is especially salient for generative AI, whose meaning is still being

negotiated with reference to futures not yet realized.

At the same time, imaginaries concern not only cultural perceptions

but also valuation processes. As Wang (2021) argues, in the digital era,



-- 3 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	3

entrepreneurial value is increasingly generated through externalities and

productive consumption among the masses, with collective narratives

about technology shaping markets and directing investment flows. Recent

media reports echo this dynamic: analysts caution that soaring valuations

of AI startups are driven as much by investor sentiment and societal

expectations as by actual revenues or technical performance (Ngui 2025;

Shefrin 2025). These cases underscore how imaginaries can translate into

market optimism, speculative bubbles, and strategic bets. Thus, imaginar-

ies not only enrich theoretical debates in the science and technology

studies (STS) but also illuminate pressing real-world dynamics.

Despite the importance of imaginaries in understanding emerging

technologies, existing studies have applied the concept primarily to poli-

cymakers and publics (Selwyn and Gallo Cordoba 2022; Kuai 2025; Van

Noordt, Medaglia, and Tangi 2025). The perspectives of professional

groups, by contrast, remain notably absent. This article contributes to fill-

ing this gap by focusing on programmers, a key professional group posi-

tioned at an intermediary juncture between upstream innovation and

downstream application, who play a pivotal role in shaping how AI tech-

nologies are socially embedded (Kotti, Galanopoulou, and Spinellis 2023).1

Moreover, this gap is particularly pronounced in the Chinese context,

where the country has emerged as a global hub for generative AI, hosting

more than 4,500 AI companies and receiving extensive state-led invest-

ment (Bicker 2025). China also supports a programmer population

exceeding 9.4 million, ranking among the top three worldwide (GitHub

Staff 2024; Sun et al., 2024). Researchers have also found that many

Chinese programmers view learning and understanding AI as essential to

their career advancement (Jia 2022), underscoring the urgency for closer

analysis of this group’s imaginaries.

Building on this focus on programmers, we adopt a mixed-methods

approach grounded in empirical evidence from China, analyzed through

the conceptual lens of imaginaries. First, we conduct a computational

analysis of a large corpus of online forum posts to examine how Chinese

programmers interpret and engage with generative AI. We then draw a

nationwide survey to investigate how these imaginaries are distributed

across the programming community, with particular attention to varia-

tions among highly skilled programmers. Understanding this intra-group

heterogeneity is crucial, since those with greater technical expertise and

organizational authority may play decisive roles in either facilitating adop-

tion or expressing resistance (Burrell and Fourcade 2021; Campero 2021;

Yan and Wang 2025).

The remainder of the article proceeds as follows. We first introduce

SCOT as a theoretical foundation, followed by imaginaries as an analyti-

cal tool for examining programmers’ anticipatory visions of generative AI.



-- 4 of 37 --



4 	Y. WU AND B. SUN

Next, we review recent studies on AI imaginaries in China across national,

public, and professional domains. We then describe our mixed-methods

design and data sources, present our empirical findings, and conclude

with a discussion of programmers’ occupational imaginaries and their

implications for understanding the rapid development of the China’s AI

industry.

Literature review

SCOT and its core concepts

Technology has never been peripheral to sociological thought. Sociology

as a discipline emerged in response to the disruptions of industrialization,

as an intellectual effort to grapple with the transformative power of tech-

nological change on labor, institutions, and social life (Giddens 1976).

From its inception, classical sociological theorists have viewed technology

not merely as an external instrument, but as a constitutive force in the

making of modern society, an artifact shaping and shaped by human

intention and social relations (Durkheim 1960; Marx 1982).

In dialogue with this macro-level tradition, SCOT redirected attention

to the micro-dynamics of meaning-making and became a foundational

framework in STS, offering a systematic approach to shift focus away

from technological determinism and toward the social process of techno-

logical practice (MacKenzie and Wajcman 1999, 21). SCOT begins with

the notion of interpretive flexibility, an idea that a single technological

artifact can have multiple meanings and uses depending on how relevant

social groups interpret it. Within each group, these interpretations are

guided by a shared structure of goals, problem definitions, cognitive hab-

its, and material conditions, collectively termed the technological frame

(Bijker 1997, 124). As groups interact and negotiate meanings and uses,

the range of interpretations narrows, leading the artifact toward closure

and eventually stabilization (Pinch and Bijker 1984). This challenges ear-

lier deterministic views that treat stabilized technologies as inevitable out-

comes of technical features, rather than products of contingent social

processes (Bijker and Bijsterveld 2000; MacKenzie and Wajcman 1999).

Through its foundational stance and key notions, SCOT offers a valu-

able starting point for understanding how technologies are socially embed-

ded. As such, it remains a widely adopted framework for examining the

evolving sociotechnical landscape whenever new technologies emerge. In

this study, we aim to examine the programmers’ “technological frame”

around generative AI. However, as will be discussed below, the concept of

imaginaries is better suited for capturing the forward-looking and inter-

pretive dimensions of programmers’ understanding of AI.



-- 5 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	5

Beyond SCOT: imaginaries as a framework

While SCOT has been instrumental in foregrounding how technologies

are socially constructed, critics have pointed out that it overlooked struc-

tural asymmetries by portraying relevant social groups as internally coher-

ent and equally positioned, thereby obscuring the unequal power relations

that affect technological outcomes (Klein and Kleinman 2002). As Hughes

(1987) noted, technological systems are embedded in broader political,

economic, and cultural contexts that extend beyond local negotiations.

The assumption of equal participation risks masking the disproportionate

influence of elite actors. Building on this critique, this study treats pro-

grammers not as a homogeneous group, but as an internally stratified

community, where variations in technical expertise critically shape their

power to influence technological imaginaries (Burrell and Fourcade 2021).

Apart from its limited engagement with structural asymmetries, SCOT

also lacks robust analytical tools for tracing how the interpretations of a

given technology evolve over time (Bruun and Hukkinen 2003). Although

Bijker (1997, 126) attempted to articulate the content of interactions

among social groups and the power structure under this process through

the concept of “technological frame,” this notion has been defined too

broadly as “not purely cognitive, but also comprising social and material

elements.” However, this conceptual breadth has drawn criticism for its

complexity (Prell 2009), particularly its conflation of cognition and prac-

tice.2 We contend that this conflation has problematized the operational-

ization of some SCOT concepts in empirical research.

To address these limitations, this study introduces a more analytically

tractable concept: imaginaries, while keeping SCOT’s foundational com-

mitment to treating technologies symmetrically as sociotechnical artifacts.

Rather than examining the combined cognitive, social, and material ele-

ments that shape meanings and behaviors, we focus specifically on the

cognitive dimension. In doing so, we investigate how programmers imag-

ine what AI is and how it should or will affect their work. From this

perspective, the concept of imaginaries provides a sharper and more suit-

able analytical lens than technological frames, especially on its isolating

the future-oriented, cognitive dimension of collective perceptions on AI.

Originally associated with the meaning of “a mere semblance, unreal,

fictitious, pretended,” (McNeil et al. 2017, 436) the term “imaginaries” has

gradually evolved into a conceptual tool for analyzing the human capacity

to envision alternative futures. Within STS, imaginaries have become one

of the most actively used concepts for empirical inquiry, due to its ability

to articulate abstract yet socially consequential processes. Scholars have

since developed a wide range of derivative notions—from scientific imag-

inary (Fortun and Fortun 2005; Wenzel Geissler and Prince 2009),



-- 6 of 37 --



6 	Y. WU AND B. SUN

sociotechnical imaginaries (Jasanoff and Kim 2009), to AI imaginaries

(Zhong et al. 2025)—to capture different dimensions and levels of mean-

ing-making. However, the modifiers are often seen as either contextual,

tied to specific empirical domains, or analytically redundant (McNeil

et al. 2017). Against this backdrop, this study returns to the broader

notion of imaginaries to explore how programmers envision emerging

technologies like generative AI.

Building on this line of work, we apply the lens of imaginaries to

enhance conceptual precision, particularly by isolating the future-oriented,

cognitive dimension of how programmers engage with generative AI in

their everyday practice.

AI imaginaries in China: national, public and professional

perspectives

The final section reviews existing research on AI imaginaries in China

across three interconnected levels: national, public, and professional.

Given AI’s rapid development and wide-ranging applications, studies at all

three levels have increasingly centered on generative AI systems such as

ChatGPT and DeepSeek, which now serve as the primary reference point

across these domains.

At the national level, AI imaginaries in China mainly follow two tra-

jectories. The first is a developmentalist vision, domestically oriented and

framed around the state’s ambition to harness AI as a morally guided

engine of social and economic progress. This trajectory merges innova-

tion with governance, reinforcing the state’s central role in directing soci-

otechnical change (Bareis and Katzenbach 2022; Mao and Shi-Kupfer

2023; Zhu and Lu 2024). The second trajectory is outward-facing and

geopolitical, portraying AI as a key instrument for national rejuvenation

and technological sovereignty amid intensifying global competition, par-

ticularly with respect to China’s positioning in the international AI land-

scape (McInerney 2024; Richter, Katzenbach, and Zeng 2025).

Public imaginaries of AI, in contrast, are grounded more firmly in

daily encounters and concerns. These include expectations of efficiency

and convenience, as well as anxieties about privacy, misinformation, and

the diminishing distinctiveness of human cognition (Lian et al. 2024; Xu

and Zhang 2026; Zou and Liu 2024). Such public perceptions are shaped

by engagement with digital platforms and are further mediated by com-

peting narratives from government agencies, academic institutions, com-

mercial enterprises, and mass media (Meng, Zhang, and Cao 2024).

Building on these mediated public discourses, Zhong et al. (2025) intro-

duced the concept of “AI imaginaries” and proposed the “AI Imaginary

Model” (AIM) to conceptualize how collective visions of AI emerge



-- 7 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	7

through everyday sociotechnical experiences and, in turn, shape public

users’ technological identity, expectations, and cognitive engagement with

AI systems.

In contrast to the rich body of research on national and public imag-

inaries, those of professional groups remain underexamined, even though

such groups are critical in shaping the development and application of

generative AI. Existing studies on professional AI imaginaries have con-

centrated mainly on journalists and educators, occupations where AI’s

integration is already visible and contested. Journalists present mixed feel-

ings: some emphasize the efficiency gains AI brings to daily reporting,

while others highlight ethical and legal risks (Kuai 2025). Educators, by

contrast, exhibit more pronounced anxiety, reflecting concerns about both

their own capacity to use AI tools effectively and the possibility that stu-

dents might misuse these technologies or become overly dependent on

them (Kohnke, Moorhouse, and Zou 2023).

Together, these studies suggest that professional imaginaries are shaped

not only by the technical affordances of AI (Zhan et al. 2024), but also

by occupation-specific values, skills, and responsibilities, an insight that is

insufficiently addressed in the case of programmers, who are even more

crucial than journalists and educators in influencing how AI evolves and

is embedded in society.

Despite their pivotal position, scholars have paid little attention to the

subjective domain of programmers’ work and professional life, let alone

their imaginaries of generative AI. Existing studies mainly address the

objective dimensions of their work and status: one strand examines the

labor process, such as modularized task division (Jalote and Kamma 2021;

Yan and Wang 2025) and flexible working hour system (Liang 2019; Li

and Liu 2020); the other focuses on occupational stratification, often

along gender lines (Sun 2021; Wu 2020).

The few existing accounts of programmers’ subjective orientations tend

to be broad occupational culture overviews, outlining shared values,

norms, and ethics within the profession (Li 2023a; Wu 2020). Programmers

are often portrayed as exhibiting a strong faith in technological progress

and a fascination with novel systems (Wang et al. 2024, 139–140). This

technocentric orientation, combined with the demands of high-intensity

work, drives continuous self-learning, both to keep pace with technolog-

ical change and to maintain competitiveness (Wang and Yang 2021; Yan

2021). Within this ethos, self-improvement becomes not merely an exter-

nal requirement but an internalized moral imperative (Luhr 2024).

Researchers also focused on the stratification of programmers: unlike

many occupations historically stratified through bureaucratic hierarchies,

programmers are primarily differentiated by technical expertise (Burrell

and 	Fourcade 	2021), 	resting 	less 	on 	formal 	titles 	than 	on 	the



-- 8 of 37 --



8 	Y. WU AND B. SUN

accumulation of specialized knowledge, mastery of emerging tools, and

proven problem-solving ability (Campero 2021). Higher proficiency and

capacity open access to complex, high-impact projects, enabling employ-

ees to shape technical standards, mentor peers, and influence both the

professional community and the broader tech industry.

Yet this very dependence on cutting-edge expertise places them at the

forefront of technological upheaval: programmers are among the occupa-

tional groups (Zhang et al. 2025) and industries (Felten, Raj, and Seamans

2021) most directly affected by the disruptive potential of generative AI,

as automation begins to reshape their forms of labor (Shestakofsky 2017).

These dynamics make programmers not only key intermediaries in the

development of generative AI, but also analytically crucial actors in

understanding how AI is imagined, categorized, and socially embedded in

practice.

In sum, while studies of AI imaginaries have increasingly incorporated

professional perspectives, they have overlooked programmers, a structur-

ally significant yet heterogeneous social group. This study addresses that

gap by specifically focusing on programmers, analyzing how they imagine

generative AI and how such imaginaries vary across different dimensions

of technical expertise, including formal training, professional experience,

and occupational role.

Research design

This study adopts a two-stage mixed-methods design to examine both the

widespread imaginaries of AI among programmers and their distribution

across technical strata within the programming profession (Figure 1). In

the first stage, we descriptively explore a large corpus from a specialized

programmer forum to identify major patterns of interpretation and dis-

course. In the second, we estimate the prevalence of these imaginaries

across technical subgroups using a nationwide survey. This sequential

design aligns discovery-oriented insights from digital trace data with

Figure 1. Design for the two-stage mix-methods study. This framework integrates

large-scale textual and survey data to explore how Chinese programmers imagine

and interpret generative ai.



-- 9 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	9

statistically grounded survey evidence (Housley et al. 2014), jointly map-

ping the contours of programmers’ AI imaginaries.

Computational text analysis of forum data

Our corpus is drawn from a publicly available repository of “Way to

Explore” (V2EX), a leading Chinese online forum primarily used by pro-

fessional programmers. Originally introduced as a platform for “designers,

programmers, and creative individuals”3 in 2005, V2EX has evolved into

a space where user activity is overwhelmingly focused on software

development.

As of 22 July 2023, when the dataset was extracted, V2EX comprised

194,534 registered users, 801,038 posts, and 10,899,382 replies, with the

five most active categories being “develop,” “app,” “python,” “mac,” and

“Java” (Oldshensheep 2023). Compared with other mainstream platforms

for programmers, such as Stack Overflow, GitHub and CSDN, V2EX is

characterized by a high concentration of discussion-oriented posts. On

the other hand, unlike other social media platforms such as Weibo or

RedNote (Xiaohongshu), its user base is more specialized and explicitly

oriented toward technical dialogue. This combination of thematic focus,

active engagement, and public accessibility makes V2EX a highly suitable

site for examining how Chinese programmers perceive and interpret gen-

erative AI.

The target posts were identified through a keyword list derived from

both Chinese and international studies on AI perceptions (see Figure 2

Figure 2. Flow diagram of the post selection process. This stepwise filtering ensured

thematic relevance and high engagement, resulting in a robust corpus for text

analysis.



-- 10 of 37 --



10 	Y. WU AND B. SUN

for the post selection process and Table A1 in the Appendix for the

selected keywords). An initial set of 6,784 posts was retrieved from the

full dataset using this keyword filter. Subsequently, they were manually

screened to exclude entries unrelated to artificial intelligence (for exam-

ple, posts where “AI” referred to “Adobe Illustrator”). The final sample

comprised 6,475 posts, totaling approximately 4.13 million words, includ-

ing Chinese and English characters and punctuation.

Drawing 	on 	established 	computational 	approaches 	in 	sociology

(DiMaggio, Nag, and Blei 2013; Pardo-Guerra 2020), this study employs

an integrated computational-qualitative sequence to identify and interpret

programmers’ imaginaries of AI.

First, we applied an unsupervised machine learning topic model to the

forum posts to inductively uncover latent thematic clusters. The topic

modeling was performed using BERTopic, an algorithm that integrates

clustering techniques with pretrained large language models (Grootendorst

2022). Unlike traditional methods such as Latent Dirichlet Allocation

(LDA), BERTopic is well-suited to short, informal social media texts, as it

captures semantic similarity beyond surface-level word co-occurrence

(Egger and Yu 2022). Owing to these advantages, it has been increasingly

adopted in recent computational social science research (Baribi-Bartov,

Swire-Thompson, and Grinberg 2024; Garbes and Marlow 2025; Hou and

Huang 2025), providing an effective means of extracting meaningful the-

matic patterns from large-scale online discourse.

Second, building on the clusters identified through BERTopic, we fur-

ther conducted close readings of typical and influential posts, as indicated

by engagement metrics, to situate these computationally derived clusters

within their broader sociotechnical contexts, thus helping refine thematic

interpretations 	and 	contextualize 	them 	within 	lived 	experiences 	of

programmers.

The above analysis is based solely on publicly available online content,

conducted in accordance with standard ethical protocols, and approved by

the 	Science 	and 	Technology 	Ethics 	Committee 	(Humanities, 	Social

Sciences 	and 	Engineering), 	Tsinghua 	University 	(Approval 	No.

THU-04-2025-1000).

National social survey of Chinese programmers

To examine the distribution of the imaginaries identified through the

forum-based computational text analysis across technical strata, the sec-

ond stage is based on data from a large-scale online survey of Chinese

programmers, collected between July and August 2023. The survey was

designed and carried out by the Center for Social Survey and Research

and the Department of Sociology, School of Social Sciences, Tsinghua



-- 11 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	11

University, within a national research initiative on science and technology

workforce development.

The questionnaire focused on the working conditions, skill structures,

and value orientations of programmers, with a particular interest in

assessing the impact of generative AI on programmers’ labor processes.

Accordingly, items were designed to probe this issue directly. Furthermore,

the questionnaire included multiple indicators to capture the internal

stratification of the programmer community, enabling us to measure their

technical expertise from several distinct yet interconnected dimensions.

Given the uneven geographic distribution of China’s software industry,

particularly concentrated in the eastern region, the survey adopted a pur-

posive sampling design with a quota-based distribution strategy to inten-

tionally 	incorporate 	regional 	variation 	(Department 	of 	Operational

Monitoring and Coordination 2024).4 With support from a nationwide

science and technology association, the questionnaire was distributed

across key regions to reflect the structural layout of China’s software sector.

After excluding responses completed by automation tools, partially

filled questionnaires, respondents working in non-technical occupations,

as well as regions with insufficient sample sizes (Gansu, Qinghai, Yunnan,

Hainan, Inner Mongolia, and Tibet, each with fewer than 30 cases), the

final analytic sample comprised 14,445 valid cases across 25 provin-

cial-level administrative regions in the Chinese mainland. As one of the

few large-scale social surveys to focus specifically on programmers, both

in China and globally, this dataset offers a rare empirical vantage point

for understanding the occupational realities of this key professional group

within the ongoing digital transformation.

Ordinary Least Square (OLS) models were applied to analyze the dom-

inant imaginaries among different groups. To achieve this, we translate

the metaphorical distinctions observed in online discourse into a sur-

vey-based indicator that captures respondents’ relative orientation toward

the two imaginaries. Given that online discussions predominantly frame

AI in instrumental terms, particularly in relation to programming tasks,

we measured programmers’ attitudes toward AI using the following sur-

vey item: “To what extent do you think generative AI (e.g., ChatGPT)

poses a threat to your profession?” Responses were recorded on a five-

point Likert scale ranging from “Much more of a threat than a help” (1)

to “Much more of a help than a threat” (5), with higher scores reflecting

a stronger belief that AI is a help.

The key independent variable is technical expertise, which, as dis-

cussed earlier, constitutes a core axis of internal stratification among

programmers (Burrell and Fourcade 2021). We operationalize technical

expertise through three binary indicators that capture complementary

dimensions 	of 	technical 	capacity: 	first, 	educational 	background:



-- 12 of 37 --



12 	Y. WU AND B. SUN

whether the respondent holds a degree in computer science or soft-

ware engineering (1 for yes, 0 for no); second, job type of program-

ming: 	whether 	the 	respondent 	occupies 	an 	advanced 	technical

role—defined as system design, artificial intelligence, or algorithm

development (1 for advanced roles, 0 for other positions, including

front-end and back-end development, visual design, data work, opera-

tions and maintenance, and software testing); third, years of profes-

sionally programming: whether the respondent has more than four

years of programming experience, measured from the start of their

formal career, which corresponds to the median tenure among all sur-

veyed programmers (1 for four years or longer, 0 for less than four

years). Each indicator takes the value of one to denote a higher level

of technical expertise. Together, they represent layered dimensions of

technical expertise: formal education, functional responsibility, and

accumulated experience.

In addition to the key independent variables, we further control for a

broad set of sociodemographic characteristics, comprising gender, age,

type of hukou, marital status, number of children, and years of education,

as well as work-related attributes, encompassing type of employer, monthly

income, professional rank, weekly workhours, number of projects, and

number of team members, as these variables are considered influential for

occupational 	outcomes 	among 	programmers 	(Yan 	and 	Wang 	2025).

Descriptive statistics for all variables are reported in Table B1 of the

Appendix.

Results and findings

Overview of discussions and topic modeling

To provide an initial overview, we present the quarterly volume of

AI-related posts on V2EX, juxtaposed with the Baidu Search Index on AI,

rescaled to match the range of V2EX posts, to facilitate comparison with

public search interest. Figure 3 reveals three waves of attention: an initial

rise in 2016 (coinciding with AlphaGo’s match against Lee Sedol), a sec-

ondary peak in 2019 (around Baidu’s AI conference), and a dramatic

surge in late 2022 with the release of ChatGPT.

From these temporal patterns, two features are particularly noteworthy.

First, the 2023 wave dwarfs earlier activity—posts jump from a local peak

of 168 in the third quarter of 2019 to 1,879 in the second quarter of 2023

(over tenfold). Second, it is only with the advent of generative AI that

programmer engagement with AI becomes both massive and sustained.

Prior to the end of 2022, AI was discussed intermittently and in modest

volumes, even after high-profile events. The post-ChatGPT surge thus



-- 13 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	13

marks a qualitative shift: from episodic curiosity about AI in general to

intensified and ongoing reflection on its technical potential, limitations,

and implications for their own work.

Building on the above overview, we now turn to the substantive con-

tent of their discussions. We applied BERTopic to the corpus, which gen-

erated five coherent clusters, two of which contain several sub-clusters

that map the core themes of programmers’ AI-related discourse (Table 1).

The thematic labels were manually developed by the authors. As Lee and

Martin (2015) note, topic models do not uncover semantic meaning but

identify clusters of co-occurring terms that suggest latent patterns of

shared interpretation.

The largest topic cluster, accounting for nearly half of the posts (3,043

out of 6,475), focuses on AI research and development (R&D) and pro-

grammer employment. Its most representative terms include “(software)

development,” “technology,” and “familiarity.” Within this cluster, two

employment-oriented sub-clusters (T1-1 and T1-2, with 123 and 264

posts respectively) deal with skill requirements and experience thresholds

for AI employees. In these sub-clusters, discussions frame AI primarily

through its labor-market relevance—portraying it as a technical asset, a

skill to acquire, or a tool to master—hence a distinctly instrumental

orientation.

Figure 3. Temporal dynamics of v2eX posting and Baidu search index for “ai”. Both

show sharp increases around late 2022, indicating a surge in public and professional

interest following the release of ChatgPT.



-- 14 of 37 --



14 	Y. WU AND B. SUN

Another notable sub-cluster (T1-3, 211 posts) includes keywords such

as “human being,” “robot,” “possibility,” and “future,” suggesting broader

imaginaries concerning AI’s evolving role. In addition to the labor-market

focus, this cluster indicates philosophical contemplations on AI’s societal

position and its relation to human existence. Taken together, main topic

1 (T1) reflects a dual orientation: instrumental applications co-exist with

speculative or philosophical reflection.

Table 1. BeRTopic-clustered ai-related discussions on v2eX.a

Topic

hierarchy 	Thematic label

number of

posts (n) 	Top 10 representative terms

Main Topic

1

ai R&D and

Programmer

employment

3,043 	ai; (software) development; technology; artificial

intelligence; familiarity; work; algorithm;

product; related; capability.

sub-topic

1-1

Programmer

employment

123 	experience; (software) development; familiarity;

capability; priority; work; related; product;

technology; algorithm.

sub-topic

1-2

Programmer

Demand

264 	engineer; experience; company; work; algorithm;

technology; familiarity; development;

recruitment; team.

sub-topic

1-3

societal impact &

Future

Development

211 	human being; artificial intelligence; ai; possibility;

without; now; (future) development; should;

robot; future.

Main Topic

2

ecosystem &

Practices of

ChatgPT

3,071 	ChatgPT; usage; aPi; support; issue; need; model;

everyone; without; code.

sub-topic

2-1

aPi access & Model

versions (gPT-4)

341 	gPT-4; gPT; aPi; 4.0; quota; usage; account; Plus;

application; issue.

sub-topic

2-2

auxiliary Functions

& learning Tools

290 	ChatgPT; plugin; code; learning; usage; issue;

english; translation; everyone; (software)

development.

sub-topic

2-3

account Registration

& Payment

Channels

159 	Plus; credit card; DePay; ChatgPT Plus; virtual;

top-up; payment; ChatgPT; activation; binding.

Main Topic

3

software Usage &

Troubleshooting

178 	Code; usage; without; discover; briefly; feeling;

issue; open source; login; today.

Main Topic

4

web Development &

Remote work

opportunities

10 	Javascript; technology; company; remote;

maintenance; product; team; possess; work;

data.

Main Topic

5

ai hardware and i/o

Configuration

39 	system; ai; connection; output; input; two; issue;

this type; copy; correct.

Unclustered

Topic

n/a 	134 	n/a

aincludes replies before the captured date, 23rd July, 2023; original Chinese words in Table 2: (soft-

ware) development(开发), technology(技术), artificial intelligence(人工智能), familiarity(熟悉),

work(工作), algorithm(算法), product(产品), related(相关), capability(能力), experience(经验), pri-

ority(优先), engineer(工程师), company(公司), recruitment(招聘), team(团队), human being(人

类), possible(可能), without(没有), now(现在), (future) development (发展), should(应该), robot(

机器人), future(未来), usage(使用), support(支持), issue(问题), need(需要), model(模型), every-

one(大家), code(代码), quota(额度), account(账号), application(申请), plugin(插件), learning(学

习), english(英语), translation(翻译), credit card(信用卡), virtual(虚拟), top-up(充值), payment(支

付), activation(开通), binding(绑定), discover(发现), briefly(一下), feeling(感觉), open source(开

源), login(登录), today(今天), remote(远程), maintenance(维护), possess(具有), data(数据), sys-

tem(系统), connection(连接), output(输出), input(输入), two(两个), this type(这种), copy(复制),

correct(正确). Both “ai” and “artificial intelligence” were retained in the topic modeling process to

preserve the integrity of the original data and were treated as semantically equivalent during

interpretation.



-- 15 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	15

Main topic 2 (T2) centered on the ChatGPT application ecosystem, com-

prises 3,071 posts and consists of three sub-clusters: API and model version

updates (T2-1, 341 posts), auxiliary functions and learning tools (T2-2, 290

posts), and account or payment issues (T2-3, 159 posts). Collectively, these

sub-clusters highlight the forum’s continued pragmatic ethos, as users actively

co-construct informal usage manuals. Representative terms such as “API,”

“quota,” “plugin,” “translation,” and “payment” indicate a strong emphasis on

technical onboarding, productivity enhancement, and access coordination.

The remaining clusters address more specific technical challenges.

These include main topic 3 (T3), software troubleshooting (178 posts),

main topic 4 (T4), web development and remote work opportunities (10

posts), and main topic 5 (T5), AI hardware and I/O configuration (39

posts). Keywords such as “code,” “remote,” and “connection” further

underscore the pragmatic orientation that characterizes programmers’

engagement with generative AI.

Overall, across the five topic clusters, programmers’ imaginaries of

generative AI indicate three defining aspects: an instrumentalist, pragmat-

ic-oriented framing; a labor-centered, recruitment-related context; and

reflexive engagement.

The first of these, instrumentalism combined with a pragmatic orientation,

frames generative AI foremost as a means of problem-solving. Consistently

imagined as a learnable and integrable tool, AI is embedded in daily techni-

cal routines, from specific applications (T2) and configuration (T5) to trou-

bleshooting (T3), as reflected in the recurrence of technical keywords such as

"(software) development," “plugin,” and “API” across multiple clusters.

The second foregrounds AI’s entanglement with the labor process. For

programmers, employment emerges as their most immediate concern,

reflected in recruitment-related topics (T1-1, T1-2, T4), signaling AI’s

growing presence in job-seeking and hiring dynamics.

The third feature is reflexive engagement. While largely bounded within

the technical labor process, these imaginaries are not devoid of reflexivity.

Posts in T1-3 concerns about AI’s implications for human cognition and

reflect on its ethical and ontological dimensions. Such moments of specula-

tion, though intermittent and interwoven with an instrumentalist outlook,

allow Chinese programmers to move beyond task-specific concerns and

articulate early positions on AI’s societal implications, from its effects on

human cognition to its broader normative and philosophical ramifications.

Internal tensions: anxiety under instrumentalism

While topic modeling delineates the structural contours of major discus-

sion areas, it cannot, on its own, uncover the affective substance and dis-

cursive logics that animate them (DiMaggio, Nag, and Blei 2013). To



-- 16 of 37 --



16 	Y. WU AND B. SUN

address this limitation, we turn to a close reading of two among the

most-viewed AI-related posts on V2EX (Table 2). This micro-level analy-

sis reveals a striking undercurrent: even within a largely instrumentalist

and pragmatic community, the most widely engaged discussions are suf-

fused with unease, anxiety, and moments of critical reflection, collectively

forming a latent tension that underlies programmers’ imaginaries of gen-

erative AI.

Post #900126, titled “OpenAI Releases Groundbreaking ChatGPT: A

Registration Guide” (5 December 2022), drew 100,947 views and 374

replies within days of ChatGPT’s release. Initially a step-by-step guide to

circumvent access restrictions, the thread quickly turned into a forum for

divergent reactions to generative AI. Some replies struck an alarmist tone,

offering visceral warnings rather than analytic critique (Reply #1). Others

Table 2. synopsis and key excerpts from the two representative posts (translated).a

Post #900126 (100,947 clicks; 374

replies) 	Post #900396 (22,842 clicks; 149 replies)

Title 	openai releases groundbreaking

ChatgPT: a registration guide

experiencing ChatgPT: The more i played, the

more i have existential concerns

Post date 	December 5, 2022 	December 6, 2022

Main Content 	a few days ago, openai released

the much-anticipated ChatgPT,

which quickly became very

popular. however, due to

network restrictions, most

users could not access it

directly.

Below is a concise guide to

registering for ChatgPT

(details omitted):

– Prerequisites

– obtain a temporary foreign

number

– sign up for an openai account

– Phone verification

– start using ChatgPT

ai is advancing even faster than i imagined – i

don’t know what we’ll do in the future.

at first i was genuinely amazed by what

ChatgPT could do, though many commenters

found it underwhelming – i suspect they

simply didn’t ask the right questions. its

open-ended conversational style is nothing

like the old Q&a bots that just parsed

language and hooked into a search engine.

in any case, i believe the “spinning Jenny”

moment is here – or about to arrive. artisans

may lose their jobs, but countless operator

roles will be created. we shouldn’t be

pessimistic about rising productivity; we

should be excited.

Representative

replies

Reply #900126-1: “You lot are

going to kill yourselves sooner

or later”

Reply #900126-11: “Thanks, it has

been done”

Reply #900126-25: “i’m already

using this to help me write

code 😭”

Reply #900126-51: “i’m already

using it—even got the bot to

draft my year-end summary…”

Reply #900126-166: “Regex

lookup? Fake review

generation? Betting

predictions? Doesn’t feel very

meaningful… over 100

replies—what’s all the fuss?”

Reply #900396-1: “Programmers are definitely

going to be replaced”

Reply #900396-9: “Most of the replies just go

round in circles—verbose but unfocused, and

less substantive than even a manager’s

meeting. what is there to worry about?”

Reply #900396-11: “The more creative the work,

the harder it is for ai, because it only

operates on the ‘corpus’ it’s been fed—finite

and known—whereas creativity is infinite”

Reply #900396-18: “if we define innovation as

‘the recombination of old (existing) elements,’

do you still say ai can’t innovate?”

Reply #900396-34: “lMao. would you race a car

to see who’s faster? Tech shifts bring change,

but our only real rivals are other humans.”

aincludes only replies before the captured date, 23 July, 2023.



-- 17 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	17

endorsed ChatGPT as a practical aid for coding and work-related writing

(Replies #25, #51). A skeptical strand also appeared, downplaying the tool

by pointing to mundane uses such as regex lookups or fake-review gen-

eration (Reply #166). Overall, the exchange reveals growing ambivalence:

programmers oscillate between anxiety, enthusiasm, and irony as they

weigh ChatGPT’s implications for everyday coding practices and the

broader trajectory of technological development.

On the following day, Post #900396, titled “Experiencing ChatGPT:

The More I Played, the More I Have Existential Concerns,” received

22,842 views and 149 replies. The author described a “Spinning Jenny

moment,” likening ChatGPT’s emergence to the mechanization of textile

labor during the Industrial Revolution. While acknowledging the risk of

job losses, the post remained optimistic, highlighting the potential pro-

ductivity gains and the creation of new roles. The first reply, which stated

that “programmers are definitely going to be replaced,” nonetheless set a

markedly pessimistic tone. Some respondents embraced this negative out-

look (Reply #18), whereas others echoed the author’s guarded optimism

or offered more skeptical takes (Replies #9, #11, #34). These discussions,

like those in the previous post, again reveal the coexistence of reassurance

and anxiety, underscoring the broader uncertainty over how generative AI

will reshape programmers’ work.

Diversity of AI imaginaries: AI-as-machine vs. AI-as-intelligence

Drawing on these tensions, we conceptualize programmers’ imaginaries

using 	two 	metaphorical 	ideal 	types: 	“AI-as-Machine” 	and 	“AI-as-

Intelligence.” Together, these orientations capture both the labor-centered

focus and the ambivalent emotional tone evident across the dataset.

While both imaginaries treat AI as a tool, they differ in how they situate

that tool in relation to human labor and cognitive authority. The

“machine” imaginaries cast AI as a sophisticated yet ultimately manage-

able extension of automation. By contrast, the “intelligence” imaginaries

embody anxieties that the tool may already possess forms of autonomous

reasoning that threaten the very foundations of specialized and cre-

ative work.

These metaphors are not merely rhetorical; they are rooted in core

concepts from STS, where imaginaries of “machine” and “intelligence”

reflect deeper assumptions about control, agency, and human–technology

relations. The “machine” metaphor, in particular, emerges from an indus-

trial-era imaginary of technology as neutral, passive, and governable.

Consistent with Mumford’s (1934, 9–12) view of the machine as a device

for executing fixed routines, this imaginaries center on repetition, predict-

ability, and human command. As Feenberg (1999, vii) also argues,



-- 18 of 37 --



18 	Y. WU AND B. SUN

modern societies have long linked machines to instrumental rationality—

privileging efficiency, control, and standardization over ambiguity and

reflexivity. Within this lineage, the AI-as-Machine imaginaries reduce AI

to a rationalized, predictable apparatus, mirroring the bureaucratic logics

of factory discipline and administrative control. Even as generative AI

deviates technically from these mechanical systems, programmers may

still interpret it through the inherited lens of machinic subordination.

The “intelligence” metaphor, in contrast, emerges from imaginaries of

technology as adaptive, self-directed, and increasingly autonomous. Rooted

in the idea that modern technologies may acquire the appearance of

autonomous systems (Winner 1978), these imaginaries frame generative

AI as a system that evolves alongside its users.

While generative AI systems, and large language models (LLMs) in

particular, remain fundamentally algorithmic in operation, governed by

probabilistic models, recursive training cycles, and parameterized infer-

ence mechanisms, they depart from earlier back-end algorithms in visibil-

ity and interactivity. Unlike conventional systems that operated largely

behind the scenes, generative AI tools directly engage users, exhibit

self-refining behaviors, and appear to “learn” through interaction. This

interactive quality intensifies perceptions of autonomy and co-evolution,

lending credence to the “AI-as-Intelligence” imaginaries (Schinkel 2023).

Critical inquiry therefore often targets these algorithmic substrates

rather than the branded artifacts marketed as “artificial intelligence”

(Burrell and Fourcade 2021; Schinkel 2023). Within this discourse, gener-

ative AI can be seen as a new kind of “autonomous technology,” not only

in terms of its cognitive affordances but also in the way it is discursively

framed as a self-perpetuating system beyond deliberate human control.

Yet as Wachter-Boettcher (2018, 96) warns, such perceptions risk obscur-

ing the biases and institutional power embedded in algorithmic design,

reinforcing the illusion of technical objectivity and inevitability.

We argue that “machine” and “intelligence” encapsulate Chinese pro-

grammers’ imaginaries because they are emblematic metaphors of two

distinct technological eras, each imbued with layered attitudes and emo-

tions. The five metaphorical pairs in Table 3 are not merely descriptive

contrasts but constitute a schema through which programmers make

sense of AI. Spanning behavioral, functional, epistemic, developmental,

Table 3. Metaphoric contrasts between “machine” and “intelligence.”

Dimension 	Machine 	intelligence

Behavioral 	Passive 	active

Functional 	executive 	interpretive

epistemic 	interpretable 	Uninterpretable

Developmental 	Degrading 	evolving

Political 	Controllable 	Uncontrollable



-- 19 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	19

and political dimensions, these pairs chart an imagined shift from the

industrial-era 	logic 	of 	the 	“machine” 	to 	the 	digital-era 	vision 	of

“intelligence.”

These two metaphors also reflect fundamentally different relational

stances toward generative AI, inductively distilled from programmers’

forum discussions. The “machine” metaphor connotes repetition, predict-

ability, and subordination, where tools that remain firmly under human

control. While digital infrastructures such as cloud computing and stor-

age, model-as-a-service (MaaS) may improve over time through scaling

and recursive optimization, our focus is not on material wear but on the

symbolic qualities of passivity and manipulability that programmers attach

to generative AI. By contrast, the “intelligence” metaphor signals adapt-

ability and autonomy, evoking systems that co-evolve with users and resist

human mastery. Notably, however, some programmers describe AI agents

as intelligent or autonomous while expressing little sense of threat or dis-

placement. In such cases, we still categorize these as “AI-as-Machine”

imaginaries, since the underlying orientation remains tool-like and instru-

mental, maintaining human primacy over sociotechnical control. Taken

together, these metaphors do more than describe technical functions—

they structure how programmers imagine AI’s development, governance,

and implications for labor.

In sum, many Chinese programmers approach AI instrumentally, view-

ing it as a machine that offloads routine tasks, integrates new tools into

existing workflows, enhances productivity, and supports skill acquisition.

Yet beneath this pragmatic stance lies an alternative discourse that frames

AI as genuine “intelligence,” provoking anxieties over job security, profes-

sional identity, and the epistemic trustworthiness of AI-generated content.

These diverging imaginaries form the conceptual scaffold for the next

stage of our analysis, which examines their distribution across program-

mers with varying levels of technical expertise.

AI-as-machine: the dominant imaginaries among Chinese

programmers

Building on the preceding computational text analysis, which inductively

identified two imaginaries of generative AI among Chinese programmers,

“AI-as-Machine” and “AI-as-Intelligence,” we now turn to a large-scale

survey to assess their prevalence. This quantitative analysis allows us to

move from a qualitative mapping of metaphors to an operationalized

measure, enabling the examination of how these imaginaries are distrib-

uted across programmers with varying levels of technical expertise.

We begin by outlining the basic characteristics of the surveyed pro-

grammers. Consistent with existing research, over 70% of respondents



-- 20 of 37 --



20 	Y. WU AND B. SUN

were male, with an average age around 35. Most held at least a bachelor’s

degree, nearly half reported a monthly income exceeding 10,000 RMB,

and close to 60% worked more than 40 hours per week.

Regarding the key explanatory variables capturing professional exper-

tise, 59.11% of respondents held a degree in computer science or soft-

ware-related fields, while 40.89% came from other disciplines. In terms of

job type, 10.81% were employed in advanced technical positions, with the

remaining 89.19% occupying other roles. As for professional experience,

54.43% had worked in the industry for four years or more, whereas

45.57% had less than four years of experience. Descriptive statistics for all

variables are presented in Table B1 of the Appendix.

When it comes to their attitudes toward generative AI, on average,

respondents scored 3.16 on the measure of their technical expertise

(SD = 1.02), suggesting a moderately positive orientation toward gener-

ative AI. Approximately 38.08% of respondents rated AI as more help-

ful than threatening (scores 4 ~ 5), 42.06% expressed a neutral stance

(score 3), and 19.86% perceived it as more threatening than helpful

(scores 1 ~ 2).

In this study, “AI-as-Machine” imaginaries are operationalized as per-

ceiving generative AI to be more helpful than threatening, whereas “AI-as-

Intelligence” imaginaries are operationalized as perceiving it to be more

threatening than helpful. The “machine” logic captures a “practice makes

perfect” orientation, in which generative AI is viewed as a tool that can

be mastered and kept subordinate to human control. Individuals who

regard generative AI as more helpful than threatening are therefore under-

stood to hold these imaginaries. By contrast, the “intelligence” logic envi-

sions AI as an evolving and self-improving entity whose users effectively

act as “trainers,” thereby heightening concerns that it may eventually chal-

lenge human authority or expertise, resonating with the adage that “igno-

rance 	breeds 	fearlessness.” 	In 	this 	operationalization, 	higher 	scores

correspond to the “AI-as-Machine” imaginaries, whereas lower scores

align with the “AI-as-Intelligence” imaginaries.

Stratified imaginaries: variations across different levels of expertise

OLS regression was employed to examine the distribution of different

imaginaries. Before introducing the key independent variables, we first

estimated a null model (model 0) containing only the control variables.

Figure 4 visualized the results of this model, illustrating the relationships

between various socioeconomic characteristics, working conditions, and

attitudes toward generative AI. Except for professional rank, all control

variables show significant associations with the dependent variable, under-

scoring the necessity of including them in the model.



-- 21 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	21

Building on model 0, model 1 adds three key independent variables. As

shown in Figure 5, the results consistently suggest that programmers in

structurally advantaged technical positions are more inclined to perceive

generative AI as helpful. Those with a computer science or software--

related educational background report significantly higher levels of per-

ceived 	help 	(β = 0.106, 	p < 0.001). 	Likewise, 	individuals 	in 	advanced

Figure 4. attitudes toward generative ai among Chinese programmers with different

socioeconomic statuses (top) and work-related attributes (bottom). higher education,

income, and managerial status are associated with more positive orientations toward

ai, while heavy workloads and lower professional ranks correlate with greater nega-

tive orientations. Note: estimated coefficients and 95% confidence intervals are

derived from regression models (see Table C1 in the appendix for full results).



-- 22 of 37 --



22 	Y. WU AND B. SUN

technical roles express greater optimism than their counterparts in other

job categories (β = 0.056, p = 0.026). Programmers with at least four years

of professional experience also report markedly higher perceived help than

those with less experience (β = 0.185, p < 0.001). Collectively, these findings

reflect that programmers with stronger technical expertise and greater

occupational seniority are more confident in engaging with generative AI

and are therefore more likely to adopt the “AI-as-a-Machine” imaginaries.

This orientation aligns with a traditional instrumentalist understanding

of AI: as an augmentative force in human labor rather than an autono-

mous, creative intelligence. In this framing, rooted in industrial-era tech-

nological imaginaries, machines are conceived as extensions of human

capability rather than independent agents. Such a view stands in contrast

to the “AI-as-Intelligence” imaginaries.

Notably, technically proficient programmers, positioned as key actors

within digital production systems, tend to hold markedly more optimistic

views. From a SCOT perspective, such optimism is not merely an individ-

ual disposition but a structuring force that is likely to shape the trajectory

of this emerging technology. We return to this implication in the discussion.

Conclusion and discussion

The rapid proliferation of generative AI has sparked growing scholarly

interest in how such technologies are imagined by the state and the

Figure 5. attitudes toward generative ai among Chinese programmers with different

levels of technical expertise. Programmers with advanced training, formal Cs degrees,

and longer experience tend to express more favorable perceptions of ai’s utility and

less anxiety over its threats. Note: estimated coefficients and 95% confidence inter-

vals are derived from regression models (see Table C1 in the appendix for full results).



-- 23 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	23

general public. Unlike earlier waves of revolutionary technology, such as

nuclear 	power 	(Bodrunova 	2012; 	Fang 	2014), 	genetically 	modified

organisms (Tao and Shudong 2003; Guo 2005), and electric vehicles

(Anyadike-Danes 2024; Xing 2024), which were largely confined to spe-

cialized domains with clear points of regulation, generative AI is char-

acterized by its continuous, pervasive, and increasingly personalized

integration into everyday life. This proximity to daily life not only

reshapes public and professional encounters with technological change,

but 	also 	heightens 	the 	urgency 	of 	examining 	AI’s 	broader 	social

implications.

As a key social group positioned between upstream innovation and

downstream application, programmers wield considerable influence over

how generative AI is socially embedded and operationalized. Yet the

imaginaries of programmers remain underexplored. To address this gap,

this study adopts a mixed-methods approach, combining computational

topic modeling and close reading of forum posts with survey-based

regression analysis, to investigate how Chinese programmers imagine gen-

erative AI.

Based on our empirical findings, we draw two central conclusions.

First, through BERTopic modeling and close reading of influential posts,

we identify two co-existing imaginaries among Chinese programmers: an

instrumental framing of “AI-as-Machine” and a reflective framing of

“AI-as-Intelligence.” The former envisions AI as a passive, task-specific,

and controllable tool oriented toward productivity enhancement, while

the latter conceives of AI as an active, generalized, and self-evolving agent

with the potential to challenge human cognition and subjectivity. These

imaginaries are simultaneously articulated in programmers’ discourse,

reflecting both pragmatic engagement and deeper ontological concern.

Second, regression analysis shows that programmers with higher tech-

nical expertise are significantly less likely to view AI as a threat to their

jobs. This pattern suggests that professional mastery fosters both profes-

sional confidence and psychological resilience, thereby reinforcing an

instrumental “AI-as-Machine” imaginaries.

This pattern aligns with recent arguments that large AI models are not

merely technical systems but cultural and social technologies whose

meaning and usage are shaped by user knowledge and institutional posi-

tioning (Farrell et al. 2025). From a SCOT perspective, highly skilled pro-

grammers often operate as both users and producers of generative AI.

Based on our national survey of Chinese programmers, we define such

individuals as those working in AI development, algorithmic engineering,

or architectural design. They train models, design architectures, and fine-

tune applications. Their daily interactions with LLMs involve backend

parameters 	and 	constraints 	(e.g., 	compute-data-parameter 	tradeoffs,



-- 24 of 37 --



24 	Y. WU AND B. SUN

training loop optimizations, or alignment interventions), rather than

abstract anthropomorphic traits. Such expertise anchors their perception

of AI not as an autonomous intelligence, but as a technical instrument

embedded in modular workflows. As a result, their imaginaries of AI are

less mythologized and more materially grounded, reinforcing an instru-

mental, “AI-as-Machine” view.

In this sense, Chinese programmers’ imaginaries of generative AI are

not only interpretive but also stratified, shaped and distributed unevenly

along lines of technical proficiency. This pattern offers a window into the

emerging stratification within the programming profession. As highly

skilled programmers increasingly view generative AI as an assistive tool

that enhances their work, lower-skilled programmers who perceive gener-

ative AI as a threat may be more inclined to leave technical roles and

redirect their coding skills toward adjacent or non-technical occupations.

These divergent imaginaries, in turn, may interact with the material

dynamics of automation, jointly reshaping the internal structure of the

programmer community.

Our findings contribute to STS in both theoretical and empirical terms.

Theoretically, this study links the SCOT framework with the more analyti-

cally tractable concept of imaginaries, thereby responding to recent critiques

of SCOT (Basu 2023) as well as to Bijker’s (2010) own efforts to integrate

new concepts into the framework. Drawing on original survey data, we

demonstrate that imaginaries among programmers are internally stratified

according to levels of technical expertise. This highlights the social struc-

turing of AI imaginaries and directly addresses one of SCOT’s long-stand-

ing limitations, namely its neglect of stratification within relevant social

groups. Finally, by focusing not on states or nations but on programmers

as a strategically important professional community, our study answers

recent calls to extend the study of imaginaries beyond abstract macro units

to more concrete and agentive collectives (Kuchler and Stigson 2024).

Some scholars have cautioned that imaginaries risk appearing overly

abstract if detached from material practices (Mager and Katzenbach 2021;

Rahm and Rahm-Skågeby 2023). Munn (2020), for example, addresses

this by developing the notion of operational imaginaries, showing how

infrastructures concretely enact visions of the future in the present. Our

study contributes to this effort by using concrete metaphors, namely,

“machine” and “intelligence” (Table 3) to show how programmers’ imagi-

naries of generative AI are similarly articulated and specified in their pro-

fessional practices. Machines are predictable, passive, and tend to wear

down over time. Mastery over machines follows an industrial logic of

repetition and habituation: the more one engages with them, the more

effective and precise one becomes in exerting control. In contrast, “intel-

ligence” evokes a different logic: it implies an adaptive, learning entity



-- 25 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	25

whose performance improves through interaction. Intelligent agents are

not merely operated; they co-evolve with users and may develop a degree

of autonomy and unpredictability that challenges traditional models of

tool-use, raising questions about uncertainty and the erosion of human

authority. This semantic contrast thus provides a meaningful lens through

which to interpret the empirical predominance of the “AI-as-Machine”

framing among Chinese programmers, making imaginaries not only con-

ceptually relevant but also experientially grounded.

Empirically, our analysis of Chinese programmers offers distinctive

insights with broader comparative relevance. Previous comparative studies

of China’s AI imaginaries have largely adopted a macro-level perspective,

showing how the Chinese government and media portray AI as a positive

and pragmatic driver of national development (Meng et al. 2024; Wang

and Downey 2025). Our research complements this work by adding a

micro-level dimension. As both creators and diffusers of AI technologies,

programmers, especially those at senior technical levels, display a distinc-

tive optimism and instrumentalism that may help explain the wider soci-

etal enthusiasm for AI in China, though this relationship warrants further

exploration.

In summary, although this study captures a snapshot taken within

roughly six months of ChatGPT’s emergence, the imaginaries framework

provides a conceptual anchor for projecting future trajectories. The rela-

tive absence of fear, particularly among technically proficient Chinese

programmers, signals a distinctive cultural and professional disposition

toward AI: one that treats it less as a disruptive threat and more as a

malleable tool to be mastered. Tracing whether this composure endures,

intensifies, or gives way to more ambivalent attitudes will be critical for

understanding the long-term social embedding of generative AI.

At the same time, our analysis itself represents a snapshot—a node in

the evolving history of generative AI imaginaries. As a concept oriented

toward the future, imaginaries inevitably combine elements of prescience

and naive. Much like revisiting Negroponte’s (1995) Being Digital decades

later reveals both perceptive insights and unfulfilled hopes, our aim is not

to predict AI’s future but to foreground how social meaning-making

shapes technological pathways. In this sense, mapping Chinese program-

mers’ current imaginaries also provides a window into the broader logics

guiding China’s AI development.

To advance a deeper understanding of generative AI beyond its tech-

nical features, future research should situate professional imaginaries

within specific institutional contexts. Classical sociological theories of

labor, from Marx and Braverman’s critiques of deskilling to Thompson’s

(1963) emphasis on workplace resistance, have long viewed technology

not as an isolated force but as one that is deeply rooted in social



-- 26 of 37 --



26 	Y. WU AND B. SUN

relations. As generative AI becomes increasingly pervasive, scholars should

investigate how it reconfigures professional hierarchies and redefines tech-

nical expertise. This study only serves as an entry point, constrained by

its reliance on cross-sectional data. A further limitation of this study lies

in its reliance on a single online forum (V2EX) for the first-stage analysis.

While V2EX provides rich insights into programmers’ discourse, it does

not capture the full diversity of technical communities. Future research

should therefore integrate additional platforms such as GitHub or CSDN

to obtain a more comprehensive view.

Future research would benefit from updated data sources that enable

longitudinal tracking of how professional imaginaries translate into con-

crete labor-market shifts as generative AI adoption deepens. Such data

could illuminate whether lower-skilled programmers are increasingly exit-

ing technical roles, being reassigned to adjacent tasks, or adapting through

upskilling, thus empirically validating the stratification dynamics discussed

in this study. In parallel, linking with digital trace data from platforms

like GitHub or CSDN could reveal how imaginaries shape real-world pro-

gramming practices. This integration would help unpack the recursive

pathways through which expectations about generative AI not only influ-

ence individual behavior but also feed back into the technical develop-

ment and organizational embedding of AI systems.

Notes

1. 	For convenience, this article employs “programmer” in a broad sense, as

articulated by Li (2023b), to encompass related occupations such as soft-

ware professionals, software engineers, and coders.

2. 	For instance, in information systems research, where the concept of the

technological frame is widely applied, it is variably defined as either a pure-

ly cognitive construct or a hybrid of cognition and action (Nocera,

Dunckley, and Sharp 2007).

3. 	See V2EX’s introduction in Wikipedia: Wikipedia contributors. “V2EX.”

Last Modified July 2, 2025, at 03:46. https://zh.wikipedia.org/wiki/V2EX.

4. 	In this study, drawing on the current regional classifications used in official

statistics and considering the actual spatial distribution of software-related

enterprises, we collected data from four major regions, covering selected

provincial-level administrative units within each, as follows:

1 	Eastern (9 provinces/municipalities): Beijing (municipalities), Tianjin

(municipalities), Hebei, Shanghai (municipalities), Jiangsu, Zhejiang,

Fujian, Shandong, Guangdong.

2 	Central (6 provinces): Shanxi, Anhui, Jiangxi, Henan, Hubei, Hunan.

3 	Western (7 provinces/autonomous regions/municipalities): Guangxi

(autonomous regions), Chongqing (municipalities), Sichuan, Guizhou,

Shaanxi, Ningxia (autonomous regions), Xinjiang (autonomous re-

gions).



-- 27 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	27

4 	Northeast (3 provinces): Liaoning, Jilin, Heilongjiang.

Taiwan, Hong Kong and Macau are generally reported separately and not

included in statistics on the Chinese mainland.

Acknowledgements

Earlier versions of this paper were presented at the PhD School on Sociomaterial

Transformations in Norway and East Asia (SoMaT) and at the faculty lunch sem-

inar of the Department of Interdisciplinary Studies of Culture, Norwegian

University of Science and Technology (NTNU), Trondheim, on June 17 and 19,

2025, respectively. We are grateful to the faculty members and participants for

their valuable comments.

Funding

This study is supported by the project “Social Survey of Programmers in China”

(2023 [No. 20235440009]; 2024 [No. 20245660025]) at Tsinghua University. This

work was also supported by China Association for Science and Technology.

ORCID

Baicheng Sun 	http://orcid.org/0009-0007-6341-5800

References

Acemoglu, Daron, David Autor, Jonathon Hazell, and Pascual Restrepo. 2022.

“Artificial Intelligence and Jobs: Evidence from Online Vacancies.” Journal of

Labor Economics 40 (S1): S293–S340. https://doi.org/10.1086/718327.

Anyadike-Danes, Chima Michael. 2024. “Divergent Imaginaries: Transitioning to

Decarbonised Mobility in ‘Post-Coalonial’ County Durham.” Norsk Geografisk

Tidsskrift [Norwegian Journal of Geography] 78 (5): 301–312. https://doi.org/

10.1080/00291951.2024.2418300.

Bareis, Jascha, and Christian Katzenbach. 2022. “Talking AI into Being: The

Narratives and Imaginaries of National AI Strategies and Their Performative

Politics.” Science, Technology, & Human Values 47 (5): 855–881. https://doi.

org/10.1177/01622439211030007.

Baribi-Bartov, 	Sahar, 	Briony 	Swire-Thompson, 	and 	Nir 	Grinberg. 	2024.

“Supersharers of Fake News on Twitter.” Science 384 (6699): 979–982. https://

doi.org/10.1126/science.adl4435.

Basu, Sumitran. 2023. “Three Decades of Social Construction of Technology:

Dynamic Yet Fuzzy? The Methodological Conundrum.” Social Epistemology

37 (3): 259–275. https://doi.org/10.1080/02691728.2022.2120783.

Bicker, Laura. 2025. “From Chatbots to Intelligent Toys: How AI Is Booming in

China.” 	BBC 	News, 	March 	11, 	2025. 	https://www.bbc.com/news/articles/

ckg8jqj393eo.

Bijker, Wiebe E. 1997. Of Bicycles, Bakelites, and Bulbs: Toward a Theory of

Sociotechnical Change. Cambridge: The MIT Press.



-- 28 of 37 --



28 	Y. WU AND B. SUN

Bijker, Wiebe E. 2010. “How Is Technology Made?–That Is the Question.” Cambridge

Journal of Economics 34 (1): 63–76. https://doi.org/10.1093/cje/bep068.

Bijker, Wiebe E., and Karin Bijsterveld. 2000. “Women Walking Through Plans:

Technology, Democracy, and Gender Identity.” Technology and Culture 41 (3):

485–515. https://doi.org/10.1353/tech.2000.0091.

Bodrunova, Svetlana. 2012. “Chernobyl in the Eyes: Mythology as a Basis of

Individual 	Memories 	and 	Social 	Imaginaries 	of 	a 	‘Chernobyl 	Child.”

Anthropology of East Europe Review 30 (1): 13–24. https://scholarworks.iu.edu/

journals/index.php/aeer/article/view/1994.

Bruun, Henrik, and Janne Hukkinen. 2003. “Crossing Boundaries: An Integrative

Framework for Studying Technological Change.” Social Studies of Science 33 (1):

95–116. https://doi.org/10.1177/0306312703033001178.

Burrell, Jenna, and Marion Fourcade. 2021. “The Society of Algorithms.” Annual

Review of Sociology 47 (1): 213–237. https://doi.org/10.1146/annurev-soc-

090820-020800.

Campero, Santiago. 2021. “Hiring and Intra-Occupational Gender Segregation in

Software Engineering.” American Sociological Review 86 (1): 60–92. https://doi.

org/10.1177/0003122420971805.

Chatterji, Aaron, Tom Cunningham, David Deming, Christopher Ong, Carl Shan,

and Kevin Wadman. 2025. “How People Use ChatGPT.” National Bureau of

Economic Research: Working Paper 34255. Cambridge, MA: National Bureau

of Economic Research. https://doi.org/10.3386/w34255.

Department of Operational Monitoring and Coordination. 2024. 2023年软件和信

息技术服务业主要业务指标 [Key Business Indicators of the Software and

Information Technology Services Industry in 2023]. Beijing, China: Ministry of

Industry and Information Technology of the People’s Republic of China. https://

www.miit.gov.cn/rjnj2023/rj_index.html.

DiMaggio, Paul, Manish Nag, and David Blei. 2013. “Exploiting Affinities be-

tween Topic Modeling and the Sociological Perspective on Culture: Application

to Newspaper Coverage of U.S. Government Arts Funding.” Poetics 41 (6):

570–606. https://doi.org/10.1016/j.poetic.2013.08.004.

Du, Changde, Kaicheng Fu, Bincheng Wen, Yi Sun, Jie Peng, Wei Wei, Ying Gao,

et al. 2025. “Human-like Object Concept Representations Emerge Naturally in

Multimodal Large Language Models.” Nature Machine Intelligence 7 (6): 860–

875. https://doi.org/10.1038/s42256-025-01049-z.

Durkheim, Emile. 1960. The Division of Labor in Society. Illinois: The Free Press

of Glencoe.

Egger, Roman, and Joanne Yu. 2022. “A Topic Modeling Comparison Between

LDA, NMF, Top2Vec, and BERTopic to Demystify Twitter Posts.” Frontiers in

Sociology 7: 886498. https://doi.org/10.3389/fsoc.2022.886498.

Fang, Xiang. 2014. “Local People’s Understanding of Risk from Civil Nuclear

Power in the Chinese Context.” Public Understanding of Science 23 (3): 283–

298. https://doi.org/10.1177/0963662512471288.

Farrell, Henry, Alison Gopnik, Cosma Shalizi, and James Evans. 2025. “Large AI

Models Are Cultural and Social Technologies.” Science 387 (6739): 1153–1156.

https://doi.org/10.1126/science.adt9819.

Feenberg, Andrew. 1999. Questioning Technology. London: Routledge.

Felten, Edward, Manav Raj, and Robert Seamans. 2021. “Occupational, Industry,

and Geographic Exposure to Artificial Intelligence: A Novel Dataset and Its



-- 29 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	29

Potential Uses.” Strategic Management Journal 42 (12): 2195–2217. https://doi.

org/10.1002/smj.3286.

Fortun, Kim, and Mike Fortun. 2005. “Scientific Imaginaries and Ethical Plateaus

in Contemporary U.S. Toxicology.” American Anthropologist 107 (1): 43–54.

https://doi.org/10.1525/aa.2005.107.1.043.

Garbes, Laura, and Thomas Marlow. 2025. “If NPR Doesn’t See This as a Crisis,

I Don’t Know What It’ll Take’: How Journalists Use Digital Platforms to Make

Industry 	Critiques.” 	Poetics 	111: 	102007. 	https://doi.org/10.1016/j.poet-

ic.2025.102007.

Giddens, Anthony. 1976. “Classical Social Theory and the Origins of Modern

Sociology.” 	American 	Journal 	of 	Sociology 	81 	(4): 	703–729. 	https://doi.

org/10.1086/226140.

GitHub Staff. 2024. “AI Leads Python to Top Language as the Number of Global

Developers Surges.” GitHub Blog (blog), October 29, 2024 (updated Octorber

28, 2025). https://github.blog/news-insights/octoverse/octoverse-2024/.

Grootendorst, Maarten. 2022. “BERTopic: Neural Topic Modeling with a Class-

Based TF-IDF Procedure.” Preprint, arXiv. https://arxiv.org/abs/2203.05794.

Guo, Yuhua. 2005. “Angel or Devil: Social and Cultural Perspective to GM

Soybean in China.” Sociological Studies 20 (1): 84–112 + 247. https://doi.

org/10.19934/j.cnki.shxyj.2005.01.004.[In Chinese]

Hou, Yuxin, and Junming Huang. 2025. “Natural Language Processing for Social

Science Research: A Comprehensive Review.” Chinese Journal of Sociology

11 (1): 121–157. https://doi.org/10.1177/2057150X241306780.

Housley, William, Rob Procter, Adam Edwards, Peter Burnap, Matthew Williams,

Luke Sloan, Omer Rana, Jeffrey Morgan, Alex Voss, and Anita Greenhill. 2014.

“Big and Broad Social Data and the Sociological Imagination: A Collaborative

Response.” 	Big 	Data 	& 	Society 	1 	(2): 	2053951714545135. 	https://doi.

org/10.1177/2053951714545135.

Hughes, Thomas P. 1987. “The Evolution of Large Technological Systems.” In The

Social Construction of Technological Systems: New Directions in the Sociology

and History of Technology, edited by Wiebe E. Bijker, Thomas P. Hughes, and

Trevor J. Pinch. Cambridge: The MIT Press.

Jalote, Pankaj, and Damodaram Kamma. 2021. “Studying Task Processes for

Improving Programmer Productivity.” IEEE Transactions on Software Engineering

47 (4): 801–817. https://doi.org/10.1109/TSE.2019.2904230.

Jasanoff, Sheila, and Sang-Hyun Kim. 2009. “Containing the Atom: Sociotechnical

Imaginaries and Nuclear Power in the United States and South Korea.” Minerva

47 (2): 119–146. https://doi.org/10.1007/s11024-009-9124-4.

Jia, Wenjuan. 2022. “打工的重现？——S市人工智能产业基层程序员的劳动境

遇、身份认同与行动选择 [The Return of Migrant Work? Labour Conditions,

Identity and Agency Among Grassroots Programmers in the AI Industry in

City S].” Journal of East China University of Science and Technology 37 (6): 1–

16. [In Chinese]

Joyce, Simon, Charles Umney, Xanthe Whittaker, and Mark Stuart. 2023. “New

Social Relations of Digital Technology and the Future of Work: Beyond

Technological Determinism.” New Technology, Work and Employment 38 (2):

145–161. https://doi.org/10.1111/ntwe.12276.

Klein, Hans K., and Daniel Lee Kleinman. 2002. “The Social Construction of

Technology: Structural Considerations.” Science, Technology, & Human Values

27 (1): 28–52. https://doi.org/10.1177/016224390202700102.



-- 30 of 37 --



30 	Y. WU AND B. SUN

Kohnke, Lucas, Benjamin Luke Moorhouse, and Di Zou. 2023. “Exploring

Generative Artificial Intelligence Preparedness among University Language

Instructors: A Case Study.” Computers and Education: Artificial Intelligence 5:

100156. https://doi.org/10.1016/j.caeai.2023.100156.

Kotti, Zoe, Rafaila Galanopoulou, and Diomidis Spinellis. 2023. “Machine

Learning for Software Engineering: A Tertiary Study.” ACM Computing Surveys

55 (12): 1–39. https://doi.org/10.1145/3572905.

Kuai, Joanne. 2025. “Navigating the AI Hype: Chinese Journalists’ Algorithmic

Imaginaries and Role Perceptions in Reporting Emerging Technologies.” Digital

Journalism: 1–20. https://doi.org/10.1080/21670811.2025.2502851.

Kuchler, Magdalena, and Gubb Marit Stigson. 2024. “Unravelling the ‘Collective’

in Sociotechnical Imaginaries: A Literature Review.” Energy Research & Social

Science 110: 103422. https://doi.org/10.1016/j.erss.2024.103422.

Lee, Monica, and John Levi Martin. 2015. “Coding, Counting and Cultural

Cartography.” American Journal of Cultural Sociology 3 (1): 1–33. https://doi.

org/10.1057/ajcs.2014.13.

Li, Qiang, and Jie Liu. 2020. “在情怀之外: 互联网中小企业’自愿加班’的工厂政

体研究 [Beyond Sentiment: The Factory Regime of ‘Voluntary Overtime’ in

Small and Medium-Sized Internet Enterprises].” Journal of Social Development

7 (1): 204–224 + 246. [In Chinese]

Li, Xiaotian. 2023a. “Managerial Technique and Worker Subjectivity in Dialogue:

Understanding Overwork in China’s Internet Industry.” Work, Employment and

Society 37 (6): 1699–1716. https://doi.org/10.117/09500170221092585.

Li, Xiaotian. 2023b. “程序员工作的性别化——以中国信息技术产业为例 [The

Gendering of Programmers’ Work: Taking China’s IT Industry as an Example].”

Sociological Studies 368–90 + 227–228. [In Chinese]

Lian, Ying, Huiting Tang, Mengting Xiang, and Xuefan Dong. 2024. “Public

Attitudes and Sentiments toward ChatGPT in China: A Text Mining Analysis

Based 	on 	Social 	Media.” 	Technology 	in 	Society 	76: 	102442. 	https://doi.

org/10.1016/j.techsoc.2023.102442.

Liang, Meng. 2019. “弹性工时制何以失效？——互联网企业工作压力机制的理

论与实践研究” [Why Does the Flexible Working Hour System Fail? Theoretical

and 	Practical 	Research 	on 	the 	Work 	Pressure 	Mechanism 	in 	Internet

Enterprises].” Sociological Review of China 7 (3): 35–49. [In Chinese]

Luhr, Sigrid Willa. 2024. “Engineering Inequality: Informal Coaching, Glass Walls,

and Social Closure in Silicon Valley.” American Journal of Sociology 129 (5):

1409–1446. https://doi.org/10.1086/729506.

MacKenzie, Donald A., and Judy Wajcman, eds. 1999. The Social Shaping of

Technology. Maidenhead: Open University Press.

Mager, Astrid, and Christian Katzenbach. 2021. “Future Imaginaries in the Making

and Governing of Digital Technology: Multiple, Contested, Commodified.” New

Media & Society 23 (2): 223–236. https://doi.org/10.1177/1461444820929321.

Mao, Yishu, and Kristin Shi-Kupfer. 2023. “Online Public Discourse on Artificial

Intelligence and Ethics in China: Context, Content, and Implications.” AI &

Society 38 (1): 373–389. https://doi.org/10.1007/s00146-021-01309-7.

Marx, Karl. 1982. Capital: A Critique of Political Economy. Volume 1. New York:

Penguin Books.

McInerney, Kerry. 2024. “Yellow Techno-Peril: The ‘Clash of Civilizations’ and

Anti-Chinese Racial Rhetoric in the US–China AI Arms Race.” Big Data &



-- 31 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	31

Society 	11 	(2): 	20539517241227873. 	https://doi.org/10.1177/2053951

7241227873.

McNeil, Maureen Christena, Adrian Bruce MacKenzie, Richard James Christopher

Tutton, Joan Haran, and Michael Arribas-Ayllon. 2017. “Conceptualizing

Imaginaries of Science, Technology, and Society.” In The Handbook of Science

and Technology Studies, edited by Ulrike Felt, Rayvon Fouche, Clark A. Miller,

and Laurel Smith-doerr, 435–464. Cambridge: The MIT Press.

Meng, Tianguang, Jing Zhang, and Jiongyi Cao. 2024. “社交媒体空间公众大模型

认知: 主题、态度与传播 [Public Perceptions of Foundation Models in Social

Media Space: Themes, Attitudes, and Communication].” Journal of Soochow

University 45 (5): 181–190. [In Chinese]

Mumford, Lewis. 1934. Technics and Civilization. New York: Harcourt Brace.

Munn, Luke. 2020. “Injecting Failure: Data Center Infrastructures and the

Imaginaries of Resilience.” The Information Society 36 (3): 167–176. https://doi.

org/10.1080/01972243.2020.1737607.

Negroponte, Nicholas. 1995. Being Digital. New York: Alfred A. Knopf, Inc.

Ngui, Yantoultra. 2025. “AI Startup Valuations Raise Bubble Fears as Funding

Surges.” 	Reuters, 	October 	3 	https://www.reuters.com/legal/transactional/ai-

startup-valuations-raise-bubble-fears-funding-surges-2025-10-03/?utm_

source=chatgpt.com.

Nocera, Jose Abdelnour, Lynne Dunckley, and Helen Sharp. 2007. “An Approach

to the Evaluation of Usefulness as a Social Construct Using Technological

Frames.” International Journal of Human-Computer Interaction 22 (1–2): 153–

172. https://doi.org/10.1080/10447310709336959.

Oldshensheep 2023. "V2EX_scrapy" (dataset). GitHub. Accessed May 29, 2025.

https://github.com/oldshensheep/v2ex_scrap.

Pardo-Guerra, Juan Pablo. 2020. “Where Are the Market Devices? Exploring the

Links among Regulation, Markets, and Technology at the Securities and

Exchange Commission, 1935–2010.” Theory and Society 49 (2): 245–276. https://

doi.org/10.1007/s11186-020-09383-4.

Pinch, Trevor J., and Wiebe E. Bijker. 1984. “The Social Construction of Facts

and Artefacts: Or How the Sociology of Science and the Sociology of

Technology Might Benefit Each Other.” Social Studies of Science 14 (3): 399–

441. https://doi.org/10.1177/030631284014003004.

Prell, Christina. 2009. “Rethinking the Social Construction of Technology through

‘Following the Actors’: A Reappraisal of Technological Frames.” Sociological

Research Online 14 (2): 36–47. https://doi.org/10.5153/sro.1913.

Rahm, Lina, and Jörgen Rahm-Skågeby. 2023. “Imaginaries and Problematisations:

A Heuristic Lens in the Age of Artificial Intelligence in Education.” British

Journal of Educational Technology 54 (5): 1147–1159. https://doi.org/10.1111/

bjet.13319.

Richter, Vanessa, Christian Katzenbach, and Jing Zeng. 2025. “Negotiating AI(s)

Futures: Competing Imaginaries of AI by Stakeholders in the US, China, and

Germany.” 	Journal 	of 	Science 	Communication 	24 	(2). 	https://doi.

org/10.22323/2.24020208.

Schinkel, Willem. 2023. “Steps to an Ecology of Algorithms.” Annual Review of

Anthropology 52 (1): 171–186. https://doi.org/10.1146/annurev-anthro-052721-

041547.



-- 32 of 37 --



32 	Y. WU AND B. SUN

Selwyn, Neil, and Beatriz Gallo Cordoba. 2022. “Australian Public Understandings

of 	Artificial 	Intelligence.” 	AI 	& 	Society 	37 	(4): 	1645–1662. 	https://doi.

org/10.1007/s00146-021-01268-z.

Shefrin, Hersh. 2025. “Big Bets on AI in An Overvalued Environment.” Forbes,

Feburary 	28, 	2025. 	https://www.forbes.com/sites/hershshefrin/2025/02/28/

investors-are-making-big-ai-based-sentiment-bets/?utm_source=chatgpt.com.

Shestakofsky, Benjamin. 2017. “Working Algorithms: Software Automation and

the Future of Work.” Work and Occupations 44 (4): 376–423. https://doi.

org/10.1177/0730888417726119.

Sun, Ping. 2021. “Straddling between Technology and Gender Boundaries: The

Identity 	Negotiation 	of 	Female 	Programmers 	in 	China.” 	Information,

Communication 	& 	Society 	24 	(1): 	19–34. 	https://doi.org/10.1080/136911

8X.2019.1623905.

Sun, Jiwei, Xing Wei, Huiyi Hu, and Zixing Chen. 2024. “我国软件开发者数量

突破940万！开源参与者增速全球最快 [Numb er of software developers in

China surpasses 9.4 million! Growth rate of open-source contributors ranks

first globally]..” CCTV News, December 22, 2024. https://content-static.cct-

vnews.cctv.com/snow-book/index.html?item_id=4364238787833527523.

Tao, Zhang, and Zhou Shudong. 2003. “The Economic and Social Impact of

GMOs in China.” China Perspectives 2003 (3): 1–11. https://doi.org/10.4000/

chinaperspectives.359.

Thompson, Edward P. 1963. The Making of the English Working Class. New York:

Vintage Books.

Van Noordt, Colin, Rony Medaglia, and Luca Tangi. 2025. “Policy Initiatives for

Artificial Intelligence-Enabled Government: An Analysis of National Strategies

in Europe.” Public Policy and Administration 40 (2): 215–253. https://doi.

org/10.1177/09520767231198411.

Wachter-Boettcher, Sara. 2018. Technically Wrong: Sexist Apps, Biased Algorithms,

and Other Threats of Toxic Tech. New York and London: W. W. Norton &

Company.

Wang, Chadwick, and Kunyun Yang. 2021. “Enterprising and Lost: Professional

Lives of Programmer Interns.” Chinese Journal of Sociology 7 (2): 252–279.

https://doi.org/10.1177/2057150X211006938.

Wang, Ning. 2021. “数字化时代的生产性消费与剥削形式——从剩余价值剥削

到外部性剥削 [Productive Consumption and Forms of Exploitation in the

Digital Era: From Surplus Value Exploitation to Externality Exploitation].”

Fujian Tribune 10: 202–216. [In Chinese]

Wang, Tianfu, Zehua Yan, Baicheng Sun, et al. 2024. 中国软件工程师: 工作、生

活与观念” [Programmers in China: Their Work, Life and Values]. 1st ed.

Beijing: Social Sciences Academic Press.[In Chinese]

Wang, Weili, and John Downey. 2025. “Mapping the Sociotechnical Imaginaries

of Generative AI in UK, US, Chinese and Indian Newspapers.” Public

Understanding 	of 	Science 	34 	(7): 	930–948. 	https://doi.org/10.1177/

09636625251328518.

Wenzel Geissler, P., and Ruth J. Prince. 2009. “Active Compounds and Atoms of

Society: 	Plants, 	Bodies, 	Minds 	and 	Cultures 	in 	the 	Work 	of 	Kenyan

Ethnobotanical Knowledge.” Social Studies of Science 39 (4): 599–634. https://

doi.org/10.1177/0306312709104075.

Williams, Robin, and David Edge. 1996. “The Social Shaping of Technology.”

Research Policy 25 (6): 865–899. https://doi.org/10.1016/0048-7333(96)00885-2.



-- 33 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	33

Winner, Langdon. 1978. Autonomous Technology: Technics-out-of-Control as a

Theme in Political Thought. Cambridge: The MIT Press.

Wu, Tongyu. 2020. “The Labour of Fun: Masculinities and the Organisation of

Labour Games in a Modern Workplace.” New Technology, Work and Employment

35 (3): 336–356. https://doi.org/10.1111/ntwe.12180.

Xing, Jianwei. 2024. “Sustainable Development in China: Environment Governance

and Climate Action.” China Economic Journal 17 (1): 1–2. https://doi.org/10.10

80/17538963.2023.2300859.

Xu, Zengzhan, and Xi Zhang. 2026. “A Cross-Platform Comparison of Public

Discussions Regarding ChatGPT on Twitter and Weibo: Data-Driven Analysis.”

International Journal of Human–Computer Interaction 42 (1): 492–508. https://

doi.org/10.1080/10447318.2025.2508311.

Yan, Xia. 2021. “‘Self as Enterprise’: Overarketization and the Self-Management of

R&D Engineers].” The Journal of Chinese Sociology 8 (1). https://doi.org/10.1186/

s40711-021-00156-9.

Yan, Zehua, and Tianfu Wang. 2025. “数字技术职业的模块化趋向——2023年软

件工程师工作调查报告 [Modularization of Digital Technology Professions:

2023 Software Engineer Profession Survey Report].” Sociological Review of

China 13 (4): 233–256. [In Chinese]

Zhan, Emily S., María D. Molina, Minjin Rheu, and Wei Peng. 2024. “What Is

There 	to 	Fear? 	Understanding 	Multi-Dimensional 	Fear 	of 	AI 	from 	a

Technological 	Affordance 	Perspective.” 	International 	Journal 	of 	Human–

Computer Interaction 40 (22): 7127–7144. https://doi.org/10.1080/10447318.202

3.2261731.

Zhang, Dandan, Yu Hang, Li Lixing, Hu Jiayin, Mo Yiqing, and Li Hongbo. 2025.

“中国人工智能技术暴露度的测算及其对劳动需求的影响——基于大语言模

型的新证据 [The Measurement of AI Exposure and Its Impact on Labor

Demand in China: Evidence from Large Language Models].” Journal of

Management World 7: 59–72. [In Chinese]

Zhong, Bu, Yunya Song, Guangchao Charles Feng, Jingyuan Shi, Yuner Zhu, Lola

Xie, Wanhui April Zhou, et al. 2025. “AI Imaginaries Shape Technological

Identity and Digital Futures.” Computers in Human Behavior 169: 108682.

https://doi.org/10.1016/j.chb.2025.108682.

Zhu, Yina, and Yangxu Lu. 2024. “Practice and Challenges of the Ethical

Governance of Artificial Intelligence in China: A New Perspective.” Cultures of

Science 7 (1_suppl): 14–23. https://doi.org/10.1177/20966083251315227.

Zou, Wenxue, and Zikun Liu. 2024. “Unraveling Public Conspiracy Theories

Toward ChatGPT in China: A Critical Discourse Analysis of Weibo Posts.”

Journal of Broadcasting & Electronic Media 68 (1): 1–20. https://doi.org/10.108

0/08838151.2023.2275603.

About the Authors

Yingfa Wu is a PhD candidate in the Department of Sociology at University of

Cambridge. His research interests include digital sociology and economic

sociology.

Baicheng Sun is a PhD candidate in the Department of Sociology, Tsinghua

University. His research focuses on digital sociology, science and technology stud-

ies (STS) and sociology of work.



-- 34 of 37 --



34 	Y. WU AND B. SUN

Appendix

Post selection procedure

References for selection of keywords:

Meng, Tianguang, Jing Zhang, and Jiongyi Cao. 2024. “社交媒体空间公众大

模型认知: 主题、态度与传播 [Public Perceptions of Foundation Models in

Social Media Space: Themes, Attitudes, and Communication].” Journal of Soochow

University (Philosophy & Social Science Edition) 45 (5): 181–190. [In Chinese]

Miyazaki, Kunihiro, Taichi Murayama, Takayuki Uchiba, Jisun An, and

Haewoon Kwak. 2024. “Public Perception of Generative AI on Twitter: An

Empirical Study Based on Occupation and Usage.” EPJ Data Science 13 (2).

https://doi.org/10.1140/epjds/s13688-023-00405-7.

Lian, Ying, Huiting Tang, Mengting Xiang, and Xuefan Dong. 2024. “Public

Attitudes and Sentiments toward ChatGPT in China: A Text Mining Analysis

Based on Social Media.” Technology in Society 76: 102442. https://doi.org/10.1016/j.

techsoc.2023.102442.

Zhang, Erkun, Hongzhong Zhang, Junchen Yao, et al. 2024. “AIGC议题的动态

演进与传播结构: 	基于微博和Twitter的比较分析 	[Dynamic 	Evolution 	and

Communication Structure of AIGC Topics: A Comparative Analysis Based on

Weibo and Twitter].” Journal of Xi’an Jiaotong University (Social Sciences) 44 (3):

176–186. [In Chinese]

Table A1. Criteria for keyword selection.

Category 	Keywords 	sources

general

concepts

人工智能, artificial intelligence, ai, 大语言模型, 大模

型, large language model, llM, llMs, ai 生成内

容, aigC

Meng, Zhang, and Cao 2024;

Zhang et al., 2024

specific ai

products

gPT, bing chat, bingchat, perplexity, 文心一言, eRnie,

豆包, Doubao, 通义千问, qwen, 智谱清言,

ChatglM, 月之暗面, Kimi, bard, gemini, claude,

dall, midjourney, imagen, craiyon, sTaBle

DiFFUsion, sTaBleDiFFUsion, copilot, copilot

lian et al. 2024; Miyazaki

et al., 2024



-- 35 of 37 --



ChINeSe SOCIOlOgICAl RevIeW 	35

Descriptive statistics of key variables

Table B1. Descriptive statistics of key variables.

variables 	Frequency

Percent

(mean) 	SD 	Min 	Max

attitudes toward generative ai 	14,445 	3.16 	1.02 	1 	5

Much more of a

threat than a

help

1,353 	9.37%

More of a threat

than a help

1,516 	10.49%

hard to say/not

sure

6,075 	42.06%

More of a help

than a threat

4,501 	31.16%

Much more of a

help than a

threat

1,000 	6.92%

educational

background

Computer or

software related

8,539 	59.11%

not computer or

software related

5,906 	40.89%

Job type of

programming

advanced 	1,562 	10.81%

other 	12,883 	89.19%

Years of

professionally

programming

4 years or longer 	7,862 	54.43%

less than 4 years 	6,583 	45.57%

gender 	Female 	4,130 	28.59%

Male 	10,315 	71.41%

age 	14,445 	35.18 	11.20 	15 	68

Type of Hukou 	Urban 	8,252 	57.13%

Rural 	6,193 	42.87%

Marriage status 	Married at least

once

7,272 	50.34%

never married 	7,173 	49.66%

number of children 	14,445 	0.69 	0.78 	0 	3

Years of education 	14,445 	15.56 	2.54 	9 	21

Type of employer 	Public sector 	5,867 	40.62%

Private sector 	8,578 	59.38%

Monthly income 	10,000 yuan RMB

and more

7,027 	48.65%

less than 10,000

yuan RMB

7,418 	51.35%

Professional rank 	higher 	3,053 	21.14%

other 	11,392 	78.86%

weekly workhours 	no more than

40 hours

6,092 	42.17%

More than

40 hours

8,353 	57.83%

number of projects 	14,445 	3.58 	1.66 	1 	6

number of team

members

no more than 5 	3,866 	26.76%

More than 5 	10,579 	73.24%

notes: Hukou is China’s household registration system that classifies citizens based on their place of

registration and links them to different access to social welfare, education, employment, and man-

agement. in this study, Hukou is categorized into urban and rural types; Type of employer is clas-

sified by ownership: public sector (state-owned or collective enterprises) and private sector

(privately owned enterprises or self-employed business); level of professional title is grouped into

two categories: higher (senior-level titles such as “senior engineer”) and other (including junior,

intermediate, and unspecified ranks).



-- 36 of 37 --



36 	Y. WU AND B. SUN

Regression model results for different dimensions of technical

expertise

Table C1. ols regression results.

variables 	Model 0 	Model 1

educational background (ref. not

computer or software related

major)

0.106*** (0.017)

Job type of programming (ref.

others)

0.056* (0.025)

Years of professional programming

(ref. less than 4 years)

0.185*** (0.018)

gender (ref. female) 	0.144*** (0.017) 	0.117*** (0.017)

age 	−0.012*** (0.001) 	−0.012*** (0.001)

Types of Hukou (ref. Rural Hukou) 	0.059*** (0.016) 	0.057*** (0.016)

Marriage status 	(ref. never

married)

0.164*** (0.020) 	0.114*** (0.021)

number of children 	−0.087*** (0.014) 	−0.074*** (0.014)

Years of education 	0.094*** (0.004) 	0.090*** (0.004)

Type of employer (ref. Private sector) 	−0.049** (0.016) 	−0.056*** (0.016)

Monthly income (ref. less than

10,000 yuan RMB)

0.121*** (0.018) 	0.083*** (0.018)

level of professional title (ref. other) 	−0.002 (0.020) 	−0.012 (0.020)

weekly workhours (ref. no more

than 40 hours)

−0.045** (0.016) 	−0.055*** (0.016)

number of projects 	0.081*** (0.005) 	0.068*** (0.005)

number of team members (ref. no

more than 5)

−0.212*** (0.019) 	−0.197*** (0.019)

Constant 	1.713*** (0.082) 	1.722*** (0.081)

R-squared 	0.194 	0.203

N 	14,445 	14,445

Notes: *p < 0.05; **p < 0.01; ***p < 0.001; Robust standard errors in parentheses.



-- 37 of 37 --